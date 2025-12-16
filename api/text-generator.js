const RATE_LIMIT = {};
const MAX_REQUESTS = 20;
const WINDOW_MS = 60 * 1000;

export default async function handler(req, res) {
  /* ===============================
     CORS
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
  let messages = [];

  if (Array.isArray(req.body?.messages)) {
    messages = req.body.messages.map(m => ({
      role: m.role === "ai" ? "assistant" : m.role,
      content: String(m.content || "")
    }));
  } else if (typeof req.body?.input === "string") {
    messages = [{
      role: "user",
      content: req.body.input.trim()
    }];
  }

  if (!messages.length) {
    return res.status(400).json({ error: "Missing input" });
  }

  // 🔑 SYSTEM MESSAGE — REQUIRED
  messages.unshift({
    role: "system",
    content:
      "You are a helpful AI assistant. This is a continuous conversation. " +
      "You must remember and use information the user provides earlier."
  });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-5.2-chat",
          messages
        })
      }
    );

    clearTimeout(timeout);

    const data = await openaiResponse.json();

    if (!openaiResponse.ok) {
      console.error("OPENAI ERROR:", data);
      return res.status(500).json({ error: "OpenAI request failed" });
    }

    const output = data.choices?.[0]?.message?.content;

    if (!output) {
      return res.status(500).json({ error: "No output returned" });
    }

    return res.status(200).json({ output });

  } catch (err) {
    console.error("SERVER ERROR:", err);
    return res.status(500).json({ error: "Server crash" });
  }
}

