import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import firebaseConfig from "../firebase-applet-config.json";
import { fetchWithAuth } from "./utils/api";

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

// Replace with your actual VAPID key from Firebase Console
// Project Settings -> Cloud Messaging -> Web Push certificates
const VAPID_KEY = "BHCOUTuHxFJskZOQB7i-Ne_kNA1V1MJnni1QBKwNtlXbBC-NWoGKOdVtVi_XdA_Q5yYDac1nKEwGOYVgNKXjaxs";

export const requestNotificationPermission = async (username: string) => {
  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      // Get FCM token
      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: await navigator.serviceWorker.register("/firebase-messaging-sw.js"),
      });

      if (token) {
        console.log("FCM Token:", token);
        // Send token to backend
        await fetchWithAuth("/api/save-token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ username, token }),
        });
      }
    }
  } catch (error) {
    console.error("Error requesting notification permission:", error);
  }
};

export const onMessageListener = (callback: (payload: any) => void) => {
  return onMessage(messaging, (payload) => {
    callback(payload);
  });
};

export { messaging };
