// /api/sendReminders.js
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import nodemailer from "nodemailer";

const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_CREDENTIALS);

if (!initializeApp.length) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}

const db = getFirestore();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export default async function handler(req, res) {
  const now = new Date();
  const reminderQuery = await db
    .collection("tasks")
    .where("reminder", "<=", now)
    .where("completed", "==", false)
    .get();

  const promises = [];

  reminderQuery.forEach((doc) => {
    const data = doc.data();
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: data.email, // you need to store user email in each task or fetch via userId
      subject: "⏰ Task Reminder: " + data.title,
      text: `Hi! Here's your reminder for the task: "${
        data.title
      }". Deadline: ${data.deadline.toDate().toLocaleString()}`,
    };

    promises.push(transporter.sendMail(mailOptions));
  });

  await Promise.all(promises);

  res.status(200).json({ message: "Reminders sent!" });
}
