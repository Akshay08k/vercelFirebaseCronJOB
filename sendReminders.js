import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import dotenv from "dotenv";

dotenv.config();

if (!getApps().length) {
  initializeApp({
    credential: cert(
      JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON)
    ),
  });
}

const db = getFirestore();
const auth = getAuth();

async function syncUserEmails() {
  try {
    let nextPageToken;
    do {
      // List users in batches (max 1000 per call)
      const listUsersResult = await auth.listUsers(1000, nextPageToken);
      const users = listUsersResult.users;

      const updatePromises = users.map(async (user) => {
        // Extract email from user record or providerData fallback
        const email = user.email || user.providerData[0]?.email || null;

        if (email) {
          // Update Firestore user document with the email
          await db
            .collection("users")
            .doc(user.uid)
            .set({ email }, { merge: true });
          console.log(`✅ Synced email for user $f{user.uid}: ${email}`);
        } else {
          console.log(`⚠️ No email found for user ${user.uid}`);
        }
      });

      await Promise.all(updatePromises);

      nextPageToken = listUsersResult.pageToken;
    } while (nextPageToken);

    console.log("🎉 All user emails synced successfully.");
  } catch (error) {
    console.error("❌ Error syncing user emails:", error);
  }
}

syncUserEmails();
