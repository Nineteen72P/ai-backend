export default async function handler(req, res) {
  // Allow both GET and POST
  if (req.method === "GET") {
    return res.status(200).json({
      output: "GET request received. API is reachable."
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { input } = req.body || {};

  if (!input) {
    return res.status(400).json({ error: "Missing input" });
  }

  // Temporary response (AI comes next)
  return res.status(200).json({
    output: `You sent: ${input}`
  });
}
