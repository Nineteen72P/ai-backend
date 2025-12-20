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
  res.setHeader("Access-Control-Allow-Credentials", "false");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  /* ===============================
     ENV CHECK
  =============================== */
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY not set" });
  }

  /* ===============================
     INPUT (MATCH FRONTEND)
  =============================== */
  const { input } = req.body || {};

  if (!input || typeof input !== "string" || input.trim() === "") {
    return res.status(400).json({ error: "input is required" });
  }

  /* ===============================
     OPENAI MESSAGES
  =============================== */
  const messages = [
    {
      role: "system",
      content:
        "You are a helpful AI assistant. " +
        "Summarize the user's text clearly and concisely."
    },
    {
      role: "user",
      content: input
    }
  ];

  try {
    /* ===============================
       OPENAI STREAM REQUEST
    =============================== */
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
          messages,
          stream: true
        })
      }
    );

    if (!openaiResponse.ok) {
      const err = await openaiResponse.text();
      return res.status(500).json({ error: err });
    }

    /* ===============================
       STREAM HEADERS (CRITICAL)
    =============================== */
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    // Important for Vercel / proxies
    res.flushHeaders?.();

    /* ===============================
       PIPE STREAM TO CLIENT
    =============================== */
    const reader = openaiResponse.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      res.write(chunk);
    }

    res.end();

  } catch (err) {
    console.error("OpenAI error:", err);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Internal server error" });
    }
  }
}
