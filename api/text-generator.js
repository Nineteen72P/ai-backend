const RATE_LIMIT = {};
const MAX_REQUESTS = 20;        // max requests per window
const WINDOW_MS = 60 * 1000;    // 1 minute

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
     INPUT (CHAT OR SINGLE PROMPT)
  =============================== */
  let combinedInput = "";

  // ✅ Chat history mode
  if (Array.isArray(req.body?.messages)) {
    combinedInput = req.body.messages
      .map(m => {
        const role =
          m.role === "ai" ? "AI" :
          m.role === "assistant" ? "AI" :
          m.role === "system" ? "System" :
          "User";

        return `${role}: ${String(m.content || "")}`;
      })
      .join("\n");
  }

  // ✅ Single prompt mode (backwards compatible)
  else if (typeof req.body?.input === "string") {
    combinedInput = req.body.input.trim();
  }

  if (!combinedInput) {
    return res.status(400).json({ error: "Missing input" });
  }

  try {
    /* ===============================
       TIMEOUT
    =============================== */
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    /* ===============================
       OPENAI REQUEST (RESPONSES API)
    =============================== */
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
          input: combinedInput
        })
      }
    );

    clearTimeout(timeout);

    const data = await openaiResponse.json();

    if (!openaiResponse.ok) {
      console.error("OPENAI ERROR:", data);
      return res.status(500).json({
        error: "OpenAI request failed",
        details: data
      });
    }

    /* ===============================
       EXTRACT TEXT OUTPUT
    =============================== */
    let output = null;

    for (const item of data.output || []) {
      for (const block of item.content || []) {
        if (block.type === "output_text") {
          output = block.text;
          break;
        }
      }
      if (output) break;
    }

    if (!output) {
      return res.status(500).json({
        error: "No output returned",
        raw: data
      });
    }

    /* ===============================
       SUCCESS
    =============================== */
    return res.status(200).json({ output });

  } catch (err) {
    console.error("SERVER ERROR:", err);
    return res.status(500).json({ error: "Server crash" });
  }
}
