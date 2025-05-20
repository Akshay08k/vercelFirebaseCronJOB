import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import nodemailer from "nodemailer";

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
  });
}

const db = getFirestore();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER, // your_email@gmail.com
    pass: process.env.EMAIL_PASS, // app password
  },
});

export default async function handler(req, res) {
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
}
