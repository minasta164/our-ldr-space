import { Server, Socket } from "socket.io";
import { messageService } from "../services/messageService.js";
import { profileService } from "../services/profileService.js";
import { fcmService } from "../services/fcmService.js";
import { verifySessionToken } from "../services/authService.js";

const onlineUsers = new Map<string, string>(); // username -> socketId
const activeRooms = new Map<string, string>(); // socketId -> roomName (e.g., 'chat')
const activeCalls = new Set<string>(); // usernames currently in an active call
let ioInstance: Server | null = null;

export function emitPartnerRecoveryRequested(targetUsername: "Harsya" | "Ayas", requestId: number) {
  if (!ioInstance) return;
  const partner = targetUsername === "Harsya" ? "Ayas" : "Harsya";
  const partnerSocketId = onlineUsers.get(partner);
  if (partnerSocketId) {
    ioInstance.to(partnerSocketId).emit("partner_recovery_requested", {
      targetUsername: targetUsername,
      requestId: requestId,
      requestedAt: new Date().toISOString()
    });
  }
}

export function setupSocketHandlers(io: Server) {
  ioInstance = io;
  // 1. Server-Side Handshake Authentication Middleware
  io.use((socket: Socket, next) => {
    const authHeader = socket.handshake.headers.authorization;
    const authToken = socket.handshake.auth?.token;
    
    let token = "";
    if (authToken && typeof authToken === "string") {
      token = authToken.startsWith("Bearer ") ? authToken.substring(7).trim() : authToken.trim();
    } else if (authHeader && typeof authHeader === "string") {
      token = authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : authHeader.trim();
    }

    if (!token) {
      return next(new Error("Authentication error: No session token provided"));
    }

    const session = verifySessionToken(token);
    if (!session) {
      return next(new Error("Authentication error: Invalid or expired session"));
    }

    // Attach authenticated identity to socket.data
    socket.data.username = session.username;
    socket.data.userId = session.userId;
    next();
  });

  io.on("connection", (socket: Socket) => {
    const authenticatedUser = socket.data.username as "Harsya" | "Ayas";
    console.log(`[Socket] Authenticated user connected: ${authenticatedUser} (socket: ${socket.id})`);

    // Register authenticated user into presence tracking
    onlineUsers.set(authenticatedUser, socket.id);
    socket.join(`user:${authenticatedUser}`);

    // Mark pending messages as delivered when user connects
    messageService.markAsDelivered(authenticatedUser);
    io.emit("message_status_update", { recipient: authenticatedUser, status: "delivered" });
    io.emit("online_users", Array.from(onlineUsers.keys()));

    // Optional legacy identify event that returns server-authenticated profile
    socket.on("identify", (_usernameIgnored: string, ack?: (data: any) => void) => {
      if (ack) {
        ack({
          status: "ok",
          authenticatedAs: authenticatedUser,
          onlineUsers: Array.from(onlineUsers.keys())
        });
      }
    });

    socket.on("set_active_room", (room: string) => {
      activeRooms.set(socket.id, room);
      
      // If user enters chat, mark all messages as read
      if (room === "chat" && authenticatedUser) {
        messageService.markAsRead(authenticatedUser);
        io.emit("message_status_update", { recipient: authenticatedUser, status: "read" });
      }
    });

    // Message System (Enforcing Server-Authoritative Identity)
    socket.on("send_message", async (data: any, ack?: (data: any) => void) => {
      const sender = authenticatedUser;
      const { text, voiceUrl, uuid, attachmentUrl, attachmentName, attachmentType, attachmentSize } = data;

      try {
        const newMessage = messageService.createMessage(
          sender, 
          text, 
          voiceUrl, 
          uuid,
          attachmentUrl,
          attachmentName,
          attachmentType,
          attachmentSize
        );
        
        // Broadcast to all clients
        io.emit("new_message", newMessage);
        
        // Push Notification Logic
        const recipient = sender === "Harsya" ? "Ayas" : "Harsya";
        const recipientSocketId = onlineUsers.get(recipient);
        const isRecipientInChat = recipientSocketId && activeRooms.get(recipientSocketId) === "chat";

        // If recipient is online, mark as delivered immediately
        if (recipientSocketId) {
          messageService.updateMessageStatus(newMessage.uuid, "delivered");
          io.emit("message_status_update", { uuid: newMessage.uuid, status: "delivered" });
          
          // If recipient is in chat, mark as read immediately
          if (isRecipientInChat) {
            messageService.updateMessageStatus(newMessage.uuid, "read");
            io.emit("message_status_update", { uuid: newMessage.uuid, status: "read" });
          }
        }

        if (!recipientSocketId || !isRecipientInChat) {
          const notificationTitle = sender;
          const notificationBody = text || (voiceUrl ? "Sent you a voice message 🎙️" : (attachmentName ? `Sent a file: ${attachmentName} 📎` : "Sent an attachment 📎"));
          await fcmService.sendPushNotification(recipient, notificationTitle, notificationBody, {
            type: "chat_message",
            sender,
          });
        }
        
        if (ack) ack({ status: "ok", message: newMessage });
      } catch (error: any) {
        console.error("Socket send_message error:", error);
        if (ack) ack({ status: "error", message: error.message });
      }
    });

    socket.on("message_delivered", (data: { uuid: string }) => {
      messageService.updateMessageStatus(data.uuid, "delivered");
      io.emit("message_status_update", { uuid: data.uuid, status: "delivered" });
    });

    socket.on("message_read", (data: { uuid?: string, username?: string }) => {
      if (data.uuid) {
        messageService.updateMessageStatus(data.uuid, "read");
        io.emit("message_status_update", { uuid: data.uuid, status: "read" });
      } else {
        messageService.markAsRead(authenticatedUser);
        io.emit("message_status_update", { recipient: authenticatedUser, status: "read" });
      }
    });

    socket.on("mark_read", (_data: any, ack?: (data: any) => void) => {
      messageService.markAsRead(authenticatedUser);
      io.emit("message_status_update", { recipient: authenticatedUser, status: "read" });
      if (ack) ack({ status: "ok" });
    });

    // Real-time Features
    socket.on("typing", (data: any) => {
      socket.broadcast.emit("user_typing", { ...data, sender: authenticatedUser });
    });

    socket.on("stop_typing", (data: any) => {
      socket.broadcast.emit("user_stop_typing", { ...data, sender: authenticatedUser });
    });

    socket.on("update_mood", (data: { mood: string }) => {
      const { mood } = data;
      try {
        const updatedProfile = profileService.updateProfile(authenticatedUser, { mood });
        io.emit("mood_updated", { 
          username: authenticatedUser, 
          mood: updatedProfile.mood, 
          timestamp: updatedProfile.mood_timestamp 
        });
      } catch (error) {
        console.error("Error updating mood via socket:", error);
      }
    });

    socket.on("update_focus", (data: { focus: string }) => {
      const { focus } = data;
      try {
        const updatedProfile = profileService.updateProfile(authenticatedUser, { focus });
        io.emit("focus_updated", { 
          username: authenticatedUser, 
          focus: updatedProfile.focus, 
          timestamp: updatedProfile.focus_timestamp 
        });
      } catch (error) {
        console.error("Error updating focus via socket:", error);
      }
    });

    socket.on("love_action", (data: { action: string }) => {
      const { action } = data;
      const sender = authenticatedUser;
      const recipient = sender === "Harsya" ? "Ayas" : "Harsya";
      const recipientSocketId = onlineUsers.get(recipient);
      
      if (recipientSocketId) {
        io.to(recipientSocketId).emit("receive_love_action", { sender, action });
      }
    });

    // WebRTC Signaling with Server-Authoritative Identity
    socket.on("call_user", (data: { to?: string, offer: any, callType: 'voice' | 'video' }) => {
      const from = authenticatedUser;
      const to = from === "Harsya" ? "Ayas" : "Harsya";
      const { offer, callType } = data;

      const targetSocketId = onlineUsers.get(to);
      if (!targetSocketId) {
        socket.emit("call_failed", { reason: "offline" });
        return;
      }

      // Check if either party is currently in an active call
      if (activeCalls.has(to) || activeCalls.has(from)) {
        socket.emit("call_failed", { reason: "busy" });
        return;
      }

      activeCalls.add(from);
      io.to(targetSocketId).emit("incoming_call", { from, offer, callType });
    });

    socket.on("answer_call", (data: { answer: any }) => {
      const from = authenticatedUser;
      const to = from === "Harsya" ? "Ayas" : "Harsya";
      const { answer } = data;

      activeCalls.add(from);
      const targetSocketId = onlineUsers.get(to);
      if (targetSocketId) {
        io.to(targetSocketId).emit("call_accepted", { from, answer });
      }
    });

    socket.on("ice_candidate", (data: { candidate: any }) => {
      const from = authenticatedUser;
      const to = from === "Harsya" ? "Ayas" : "Harsya";
      const { candidate } = data;

      const targetSocketId = onlineUsers.get(to);
      if (targetSocketId) {
        io.to(targetSocketId).emit("ice_candidate", { candidate });
      }
    });

    socket.on("end_call", () => {
      const from = authenticatedUser;
      activeCalls.delete(from);

      const targetUser = from === "Harsya" ? "Ayas" : "Harsya";
      activeCalls.delete(targetUser);

      const targetSocketId = onlineUsers.get(targetUser);
      if (targetSocketId) {
        io.to(targetSocketId).emit("call_ended");
      }
    });

    // Partner Recovery Real-time Alerts
    socket.on("notify_partner_recovery", (data?: { requestId?: number; targetUsername?: string }) => {
      const targetUser = (data?.targetUsername as "Harsya" | "Ayas") || authenticatedUser;
      const partner = targetUser === "Harsya" ? "Ayas" : "Harsya";
      const partnerSocketId = onlineUsers.get(partner);
      if (partnerSocketId) {
        io.to(partnerSocketId).emit("partner_recovery_requested", {
          targetUsername: targetUser,
          requestId: data?.requestId,
          requestedAt: new Date().toISOString()
        });
      }
    });

    // Gallery Real-time Synchronization
    socket.on("add_gallery_photo", (photo: any) => {
      socket.broadcast.emit("new_gallery_photo", photo);
    });

    socket.on("delete_gallery_photo", (data: { id: number }) => {
      socket.broadcast.emit("gallery_photo_deleted", data);
    });

    socket.on("disconnect", () => {
      activeRooms.delete(socket.id);
      activeCalls.delete(authenticatedUser);
      onlineUsers.delete(authenticatedUser);
      io.emit("online_users", Array.from(onlineUsers.keys()));

      const partner = authenticatedUser === "Harsya" ? "Ayas" : "Harsya";
      activeCalls.delete(partner);
      const partnerSocketId = onlineUsers.get(partner);
      if (partnerSocketId) {
        io.to(partnerSocketId).emit("call_ended");
      }
      console.log(`[Socket] User disconnected: ${authenticatedUser}`);
    });
  });
}
