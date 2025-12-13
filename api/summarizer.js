const RATE_LIMIT = {};
const MAX_REQUESTS = 20;        // max requests per window
const WINDOW_MS = 60 * 1000;    // 1 minute

export default async function handler(req, res) {
  // --- CORS ---
  const allowedOrigin = "https://6e13f7-7f.myshopify.com";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // --- RATE LIMIT ---
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket.remoteAddress ||
    "unknown";

  const now = Date.now();
  RATE_LIMIT[ip] = RATE_LIMIT[ip] || [];
  RATE_LIMIT[ip] = RATE_LIMIT[ip].filter(t => now - t < WINDOW_MS);

  if (RATE_LIMIT[ip].length >= MAX_REQUESTS) {
    return res.status(429).json({ error: "Too many requests" });
  }

  RATE_LIMIT[ip].push(now);

  // --- INPUT ---
  const input = (req.body?.input || "").trim();
  if (!input) {
    return res.status(400).json({ error: "Missing input" });
  }

  try {
    // --- TIMEOUT ---
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 15000);

    // --- OPENAI CALL ---
    const openaiResponse = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
        model: "gpt-4o-mini",
        input: `Summarize the following text clearly and concisely:\n\n${input}`
        })
      }
    );

    const data = await openaiResponse.json();

    if (!openaiResponse.ok) {
      console.error("OPENAI ERROR:", data);
      return res.status(500).json({
        error: "OpenAI request failed",
        details: data
      });
    }

    // --- EXTRACT TEXT ---
    let output = null;
    for (const item of data.output || []) {
      for (const block of item.content || []) {
        if (block.type === "output_text") {
          output = block.text;
          break;
        }
      }
    }

    if (!output) {
      return res.status(500).json({
        error: "No output returned",
        raw: data
      });
    }

    return res.status(200).json({ output });
  } catch (err) {
    console.error("SERVER ERROR:", err);
    return res.status(500).json({ error: "Server crash" });
  }
}
