import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import nodemailer from "nodemailer";
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

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).send("Unauthorized");
  }

  try {
    // 1. Sync all user emails from Auth to Firestore
    let nextPageToken;
    do {
      const listUsersResult = await auth.listUsers(1000, nextPageToken);
      const users = listUsersResult.users;

      const updatePromises = users.map(async (user) => {
        const email = user.email || user.providerData[0]?.email || null;
        if (email) {
          await db
            .collection("users")
            .doc(user.uid)
            .set({ email }, { merge: true });
        }
      });

      await Promise.all(updatePromises);
      nextPageToken = listUsersResult.pageToken;
    } while (nextPageToken);

    // 2. Fetch tasks due for reminder within last 24 hours and not notified
    const now = Timestamp.now();
    const twentyFourHoursAgo = Timestamp.fromDate(
      new Date(now.toDate().getTime() - 24 * 60 * 60 * 1000)
    );

    const snapshot = await db
      .collection("tasks")
      .where("reminder", "<=", now)
      .where("reminder", ">", twentyFourHoursAgo)
      .where("completed", "==", false)
      .where("notified", "==", false)
      .get();

    if (snapshot.empty) {
      return res.status(200).send("No pending reminders.");
    }

    // 3. Send reminder emails for each task
    const sendPromises = snapshot.docs.map(async (doc) => {
      const task = doc.data();

      // Get email from synced Firestore user doc
      const userDoc = await db.collection("users").doc(task.userId).get();
      const email = userDoc.data()?.email;

      if (!email) {
        return `No email for user ${task.userId} (skipped task "${task.title}")`;
      }

      const mailOptions = {
        from: "TaskFlow",
        to: email,
        subject: `🔔 Reminder: ${task.title}`,
        text: task.description || "You have a task reminder!",
        html: `
    <div style="
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      color: #222;
      background: #f9f9f9;
      padding: 20px;
      border-radius: 8px;
      max-width: 600px;
      margin: auto;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    ">
      <h2 style="color: #0070f3; border-bottom: 2px solid #0070f3; padding-bottom: 8px;">
        Reminder: ${task.title}
      </h2>
      <p style="font-size: 16px; line-height: 1.5;">
        ${task.description || "Hey! Just a friendly reminder about your task."}
      </p>
      <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />
      <p style="font-size: 14px; color: #555;">
        This reminder was generated automatically by your Task Manager.
      </p>
      <p style="font-size: 12px; color: #aaa;">
        © ${new Date().getFullYear()} TaskFlow. All rights reserved.
      </p>
    </div>
  `,
      };

      try {
        await transporter.sendMail(mailOptions);
        await doc.ref.update({ notified: true });
        return `Reminder sent to ${email} for task "${task.title}"`;
      } catch (e) {
        return `Failed to send email to ${email} for task "${task.title}": ${e.message}`;
      }
    });

    const sendResults = await Promise.all(sendPromises);

    return res
      .status(200)
      .send(
        [
          "User emails synced successfully.",
          `Processed ${snapshot.size} reminders.`,
          ...sendResults,
        ].join("\n")
      );
  } catch (error) {
    return res.status(500).send(`Error in cron job: ${error.message}`);
  }
}
