import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import nodemailer from "nodemailer";

// Initialize Firebase app only once
if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
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
  // Authorization check for cron protection
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).send("Unauthorized");
  }

  try {
    const now = Timestamp.now();
    const fiveMinAgo = Timestamp.fromDate(
      new Date(now.toDate().getTime() - 5 * 60 * 1000)
    );

    const snapshot = await db
      .collection("tasks")
      .where("reminder", "<=", now)
      .where("reminder", ">", fiveMinAgo)
      .where("completed", "==", false)
      .get();

    if (snapshot.empty) {
      return res.status(200).send("✅ No reminders to send.");
    }

    const emailPromises = snapshot.docs.map(async (doc) => {
      const task = doc.data();
      const userDoc = await db.collection("users").doc(task.userId).get();
      const email = userDoc.data()?.email;
      if (!email) return;

      return transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: `🔔 Reminder: ${task.title}`,
        text: task.description || "You have a task reminder!",
      });
    });

    await Promise.all(emailPromises);
    res.status(200).send("✅ Reminder emails sent.");
  } catch (error) {
    console.error("❌ Error in reminder cron:", error);
    res.status(500).send("❌ Error sending reminders.");
  }
}
