const RATE_LIMIT = {};
const MAX_REQUESTS = 30;
const WINDOW_MS = 60 * 1000;

export default async function handler(req, res) {
  /* ===============================
     CORS (STREAM SAFE)
  =============================== */
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Accept"
  );

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY not set" });
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
     BODY PARSE (JSON + FORM + RAW)
  =============================== */
  let body = "";
  await new Promise(resolve => {
    req.on("data", chunk => (body += chunk));
    req.on("end", resolve);
  });

  let input = "";

  // Try JSON
  try {
    const parsed = JSON.parse(body);
    input = parsed.input || parsed.prompt || "";
  } catch {
    // Try form-urlencoded or raw
    const match =
      body.match(/input=([^&]+)/) ||
      body.match(/prompt=([^&]+)/);

    if (match) {
      input = decodeURIComponent(match[1].replace(/\+/g, " "));
    }
  }

  input = (input || "").trim();

  if (!input) {
    return res.status(400).json({
      error: "Missing input",
      receivedBody: body
    });
  }

  /* ===============================
     OPENAI STREAM
  =============================== */
  try {
    const openaiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          stream: true,
          messages: [
            {
              role: "system",
              content:
                "You are a helpful, friendly AI assistant. Answer clearly and concisely."
            },
            {
              role: "user",
              content: input
            }
          ]
        })
      }
    );

    if (!openaiResponse.ok) {
      const err = await openaiResponse.text();
      return res.status(500).json({ error: err });
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const reader = openaiResponse.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }

    res.end();
  } catch (err) {
    console.error("Chatbot error:", err);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Internal server error" });
    }
  }
}
