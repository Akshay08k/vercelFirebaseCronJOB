// api/cron.js

import nodemailer from "nodemailer";
import { getFirestore } from "firebase-admin/firestore";
import { cert, initializeApp, getApps } from "firebase-admin/app";

// Initialize Firebase Admin
if (!getApps().length) {
  initializeApp({
    credential: cert(
      JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON)
    ),
  });
}
const db = getFirestore();

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).send("Unauthorized");
  }

  const today = new Date().toISOString().split("T")[0];

  // Fetch all tasks from Firestore
  const snapshot = await db.collection("tasks").get();
  const tasks = snapshot.docs.map((doc) => doc.data());

  // Filter today's tasks
  const reminders = tasks.filter((task) => task.dueDate === today);

  // Set up mail transport
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  for (const task of reminders) {
    await transporter.sendMail({
      from: `"Reminder Bot" <${process.env.EMAIL_USER}>`,
      to: task.email,
      subject: "⏰ Reminder: Your Task is Due Today!",
      text: `Hi ${
        task.name || "there"
      }, just a friendly reminder to complete your task: ${task.title}`,
    });
  }

  return res
    .status(200)
    .json({ status: "Reminders sent", count: reminders.length });
}
