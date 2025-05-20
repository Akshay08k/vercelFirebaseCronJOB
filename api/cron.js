import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import nodemailer from "nodemailer";

// Initialize Firebase app only once
if (!getApps().length) {
  initializeApp({
    credential: cert(
      JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON)
    ),
  });
}

const db = getFirestore();

// Setup nodemailer transporter
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
    const now = Timestamp.now();
    const twentyFourHoursAgo = Timestamp.fromDate(
      new Date(now.toDate().getTime() - 24 * 60 * 60 * 1000)
    );

    const snapshot = await db
      .collection("tasks")
      .where("reminder", "<=", now)
      .where("reminder", ">", twentyFourHoursAgo)
      .where("completed", "==", false)
      .where("notified", "==", false) // only tasks not notified yet
      .get();

    if (snapshot.empty) {
      return res.status(200).send("✅ No pending reminders.");
    }

    const emailPromises = snapshot.docs.map(async (doc) => {
      const task = doc.data();
      const userDoc = await db.collection("users").doc(task.userId).get();
      const email = userDoc.data()?.email;
      if (!email) return;

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: `🔔 Reminder: ${task.title}`,
        text: task.description || "You have a task reminder!",
      });

      // Mark task as notified to avoid duplicate reminders
      await doc.ref.update({ notified: true });
    });

    await Promise.all(emailPromises);
    res.status(200).send("✅ Reminder emails sent.");
  } catch (error) {
    console.error("❌ Error in reminder cron:", error);
    res.status(500).send("❌ Error sending reminders.");
  }
}
