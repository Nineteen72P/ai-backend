const RATE_LIMIT = {};
const MAX_REQUESTS = 40;
const WINDOW_MS = 60 * 1000;

export default async function handler(req, res) {
  // -------------------------------
  // CORS (lock to Shopify domain)
  // -------------------------------
  const allowedOrigin = "https://mayti.org";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // -------------------------------
  // Rate limiting
  // -------------------------------
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

  // -------------------------------
  // Env check
  // -------------------------------
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      error: "OPENAI_API_KEY missing in Vercel environment"
    });
  }

  // -------------------------------
  // Parse body
  // -------------------------------
  const body =
    typeof req.body === "string" ? JSON.parse(req.body) : req.body;

  const messages = Array.isArray(body?.messages) ? body.messages : [];

  if (!messages.length) {
    return res.status(400).json({ error: "Missing messages" });
  }

  // Keep last 12 turns only
  const trimmed = messages
    .filter(
      m =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string"
    )
    .slice(-12);

  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 15000);

    // Convert chat history to text
    const chatText = trimmed
      .map(m => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n");

    // -------------------------------
    // OpenAI request
    // -------------------------------
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
          input: `You are a helpful chatbot. Keep responses clear and concise.\n\nConversation:\n${chatText}\n\nASSISTANT:`
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

    // -------------------------------
    // Extract response text
    // -------------------------------
    let reply = null;

    for (const item of data.output || []) {
      for (const block of item.content || []) {
        if (block.type === "output_text") {
          reply = block.text;
          break;
        }
      }
      if (reply) break;
    }

    if (!reply) {
      return res.status(500).json({
        error: "No output returned",
        raw: data
      });
    }

    // -------------------------------
    // ✅ CRITICAL FIX:
    // return { output }, not { reply }
    // -------------------------------
    return res.status(200).json({
      output: reply
    });

  } catch (err) {
    console.error("SERVER ERROR:", err);
    return res.status(500).json({
      error: "Server crash"
    });
  }
}
