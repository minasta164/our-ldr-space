import db from "../database/db.js";
import { randomUUID } from "crypto";

export interface Message {
  id?: number;
  uuid: string;
  sender: string;
  text: string | null;
  voiceUrl: string | null;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentType?: string | null;
  attachmentSize?: number | null;
  seen: number;
  status: 'sent' | 'delivered' | 'read';
  timestamp: string;
}

export const messageService = {
  getMessages(): Message[] {
    return db.prepare("SELECT * FROM messages ORDER BY timestamp ASC").all() as Message[];
  },

  createMessage(
    sender: string, 
    text: string | null, 
    voiceUrl: string | null, 
    uuid?: string,
    attachmentUrl?: string | null,
    attachmentName?: string | null,
    attachmentType?: string | null,
    attachmentSize?: number | null
  ): Message {
    const finalUuid = uuid || randomUUID();
    
    // Check for duplicate UUID to prevent race conditions/retries from client
    const existing = db.prepare("SELECT * FROM messages WHERE uuid = ?").get(finalUuid) as Message;
    if (existing) return existing;

    const result = db.prepare(
      "INSERT INTO messages (uuid, sender, text, voiceUrl, attachmentUrl, attachmentName, attachmentType, attachmentSize, seen, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'sent')"
    ).run(
      finalUuid, 
      sender, 
      text || null, 
      voiceUrl || null,
      attachmentUrl || null,
      attachmentName || null,
      attachmentType || null,
      attachmentSize || null
    );

    return {
      id: Number(result.lastInsertRowid),
      uuid: finalUuid,
      sender,
      text,
      voiceUrl,
      attachmentUrl: attachmentUrl || null,
      attachmentName: attachmentName || null,
      attachmentType: attachmentType || null,
      attachmentSize: attachmentSize || null,
      seen: 0,
      status: 'sent',
      timestamp: new Date().toISOString()
    };
  },

  updateMessageStatus(uuid: string, newStatus: 'delivered' | 'read') {
    const message = db.prepare("SELECT status FROM messages WHERE uuid = ?").get(uuid) as { status: string } | undefined;
    if (!message) return;

    // Ensure status only flows forward: sent -> delivered -> read
    const statusOrder = { 'sent': 1, 'delivered': 2, 'read': 3 };
    if (statusOrder[newStatus as keyof typeof statusOrder] > statusOrder[message.status as keyof typeof statusOrder]) {
      db.prepare("UPDATE messages SET status = ?, seen = ? WHERE uuid = ?").run(newStatus, newStatus === 'read' ? 1 : 0, uuid);
    }
  },

  markAsDelivered(recipient: string) {
    // Mark all messages sent to this user as delivered if they are currently 'sent'
    db.prepare("UPDATE messages SET status = 'delivered' WHERE sender != ? AND status = 'sent'").run(recipient);
  },

  markAsRead(username: string) {
    // Mark all messages sent to this user as read if they are currently 'sent' or 'delivered'
    db.prepare("UPDATE messages SET status = 'read', seen = 1 WHERE sender != ? AND status != 'read'").run(username);
  },

  deleteMessage(id: number) {
    // Use a transaction to ensure both message and reactions are deleted
    const deleteTx = db.transaction(() => {
      db.prepare("DELETE FROM messages WHERE id = ?").run(id);
      // Assuming there's a message_reactions table mentioned in the original code
      try {
        db.prepare("DELETE FROM message_reactions WHERE message_id = ?").run(id);
      } catch (e) {}
    });
    deleteTx();
  }
};
