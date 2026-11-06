import db from "../database/db.js";
import { fcmAdmin } from "./fcmAdmin.js";

export const fcmService = {
  saveToken(username: string, token: string) {
    try {
      // Insert or ignore if token already exists
      db.prepare("INSERT OR IGNORE INTO fcm_tokens (username, token) VALUES (?, ?)").run(username, token);
      console.log(`Token saved for user: ${username}`);
    } catch (error) {
      console.error("Error saving FCM token:", error);
    }
  },

  async sendPushNotification(recipient: string, title: string, body: string, data: any = {}) {
    if (!fcmAdmin) {
      console.warn("FCM Admin not initialized. Skipping notification.");
      return;
    }

    try {
      // Get all tokens for the recipient
      const tokens = db.prepare("SELECT token FROM fcm_tokens WHERE username = ?").all(recipient) as { token: string }[];
      
      if (tokens.length === 0) {
        console.log(`No FCM tokens found for user: ${recipient}`);
        return;
      }

      const registrationTokens = tokens.map(t => t.token);
      console.log(`Sending notification to ${recipient} (${registrationTokens.length} tokens)`);

      const message = {
        notification: {
          title,
          body,
        },
        data: {
          ...data,
          click_action: "FLUTTER_NOTIFICATION_CLICK", // For mobile, though this is a web app
        },
        tokens: registrationTokens,
      };

      const response = await fcmAdmin.messaging().sendEachForMulticast(message);
      
      console.log(`Successfully sent ${response.successCount} messages; ${response.failureCount} failed.`);

      // Handle failures (e.g., expired tokens)
      if (response.failureCount > 0) {
        const tokensToDelete: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const error = resp.error;
            if (error?.code === 'messaging/invalid-registration-token' || 
                error?.code === 'messaging/registration-token-not-registered') {
              tokensToDelete.push(registrationTokens[idx]);
            }
          }
        });

        if (tokensToDelete.length > 0) {
          console.log(`Cleaning up ${tokensToDelete.length} invalid tokens.`);
          const deleteStmt = db.prepare("DELETE FROM fcm_tokens WHERE token = ?");
          const deleteMany = db.transaction((tokens) => {
            for (const token of tokens) deleteStmt.run(token);
          });
          deleteMany(tokensToDelete);
        }
      }
    } catch (error) {
      console.error("Error sending push notification:", error);
    }
  }
};
