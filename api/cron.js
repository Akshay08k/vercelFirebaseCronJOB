import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import nodemailer from "nodemailer";

// Initialize Firebase only once
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

  const log = [];

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
      .where("notified", "==", false)
      .get();

    log.push(`📝 Found ${snapshot.size} tasks to check`);

    if (snapshot.empty) {
      return res.status(200).send("✅ No pending reminders.");
    }

    const results = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const task = doc.data();
        log.push(`📌 Task: ${task.title}`);

        const userDoc = await db.collection("users").doc(task.userId).get();
        const email = userDoc.data()?.email;

        if (!email) {
          log.push(`⚠️ No email found for user ${task.userId}`);
          return `⛔ Skipped "${task.title}" (no email)`;
        }

        try {
          const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: `🔔 Reminder: ${task.title}`,
            text: task.description || "You have a task reminder!",
          };

          log.push(`📤 Sending email to ${email} for "${task.title}"`);

          const result = await transporter.sendMail(mailOptions);
          log.push(`✅ Email sent: ${result.response}`);

          await doc.ref.update({ notified: true });
          return `✅ Reminder sent to ${email} for "${task.title}"`;
        } catch (e) {
          log.push(`❌ Failed to send to ${email}: ${e.message}`);
          return `❌ Email error for "${task.title}"`;
        }
      })
    );

    log.push(...results);
    return res.status(200).send(log.join("\n"));
  } catch (error) {
    log.push(`❌ Error in cron job: ${error.message}`);
    return res.status(500).send(log.join("\n"));
  }
}
