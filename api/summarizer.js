const RATE_LIMIT = {};
const MAX_REQUESTS = 20;
const WINDOW_MS = 60 * 1000;

export default async function handler(req, res) {
  /* ===============================
     CORS (SHOPIFY SAFE)
  =============================== */
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  /* ===============================
     RATE LIMIT
  =============================== */
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

  /* ===============================
     INPUT
  =============================== */
  const input = (req.body?.input || "").trim();
  if (!input) {
    return res.status(400).json({ error: "Missing input" });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

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

    clearTimeout(timeout);

    /* ===============================
       SAFE PARSE (CRITICAL FIX)
    =============================== */
    const rawText = await openaiResponse.text();

    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      console.error("OPENAI NON-JSON RESPONSE:", rawText);
      return res.status(500).json({
        error: "Invalid response from OpenAI"
      });
    }

    if (!openaiResponse.ok) {
      console.error("OPENAI ERROR:", data);
      return res.status(500).json({
        error: "OpenAI request failed"
      });
    }

    /* ===============================
       ROBUST OUTPUT EXTRACTION
    =============================== */
    let output =
      data.output_text ||
      data?.output?.[0]?.content?.[0]?.text ||
      null;

    if (!output && Array.isArray(data.output)) {
      for (const item of data.output) {
        if (Array.isArray(item.content)) {
          for (const block of item.content) {
            if (block.type === "output_text" && block.text) {
              output = block.text;
              break;
            }
          }
        }
        if (output) break;
      }
    }

    if (!output) {
      console.error("NO OUTPUT FOUND:", data);
      return res.status(500).json({
        error: "No output returned"
      });
    }

    return res.status(200).json({ output });

  } catch (err) {
    console.error("SERVER ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
