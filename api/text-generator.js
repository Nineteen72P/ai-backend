export default async function handler(req, res) {
  // ✅ CORS HEADERS (REQUIRED FOR SHOPIFY)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // ✅ Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // ✅ Allow GET (theme prefetch / browser checks)
  if (req.method === "GET") {
    return res.status(200).json({
      output: "GET request received. API reachable."
    });
  }

  // ✅ Handle POST (actual AI call)
  if (req.method === "POST") {
    const { input } = req.body || {};

    if (!input) {
      return res.status(400).json({ error: "Missing input" });
    }

    // Temporary response (AI next)
    return res.status(200).json({
      output: `You sent: ${input}`
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

