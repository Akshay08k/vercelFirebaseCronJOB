export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).send("Unauthorized");
  }

  // Your reminder logic here
  console.log("CRON triggered");
  res.status(200).json({ message: "Cron executed successfully!" });
}
