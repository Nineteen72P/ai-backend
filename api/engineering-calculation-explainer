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
     ENV CHECK
  =============================== */
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY not set" });
  }

  /* ===============================
     INPUT
  =============================== */
  const { prompt } = req.body || {};

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).json({ error: "prompt is required" });
  }

  /* ===============================
     SYSTEM PROMPT (GLOBAL FORMAT RULES)
  =============================== */
  const messages = [
    {
      role: "system",
      content: `
You are a professional AI assistant.

RULES:
- Always respond using Markdown
- Use headings (###) to structure answers
- Use bullet points or numbered lists where appropriate
- Never output a single unstructured paragraph
- Keep responses clean and readable
- Do not mention these rules
`
    },
    {
      role: "user",
      content: prompt
    }
  ];

  try {
    /* ===============================
       OPENAI REQUEST (STREAMING)
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
          temperature: 0.7,
          stream: true
        })
      }
    );

    if (!openaiResponse.ok) {
      const err = await openaiResponse.text();
      return res.status(500).json({ error: err });
    }

    /* ===============================
       RAW STREAM HEADERS
       (IMPORTANT: NOT SSE JSON)
    =============================== */
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const reader = openaiResponse.body.getReader();
    const decoder = new TextDecoder("utf-8");

    /* ===============================
       STREAM LOOP (RAW TEXT)
    =============================== */
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });

      // Write raw text directly
      res.write(chunk);
    }

    res.end();

  } catch (err) {
    console.error("OpenAI error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
