import admin from "firebase-admin";
import fs from "fs";
import path from "path";

// Path to service account key
const serviceAccountPath = path.join(process.cwd(), "firebase-service-account.json");

let fcmAdmin: admin.app.App | null = null;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    if (!admin.apps.length) {
      fcmAdmin = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log("Firebase Admin initialized from environment variable.");
    } else {
      fcmAdmin = admin.app();
    }
  } else if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
    if (!admin.apps.length) {
      fcmAdmin = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log("Firebase Admin initialized successfully from file.");
    } else {
      fcmAdmin = admin.app();
    }
  } else {
    console.warn("Firebase service account not configured (no FIREBASE_SERVICE_ACCOUNT_JSON or file).");
    console.warn("Push notifications will be disabled.");
  }
} catch (error) {
  console.error("Error initializing Firebase Admin:", error);
}

export { fcmAdmin };
