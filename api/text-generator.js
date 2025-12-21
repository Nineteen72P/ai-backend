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

  if (!prompt || typeof prompt !== "string" || prompt.trim() === "") {
    return res.status(400).json({ error: "prompt is required" });
  }

  /* ===============================
     SYSTEM PROMPT (GLOBAL FORMAT ENFORCEMENT)
  =============================== */
  const messages = [
    {
      role: "system",
      content: `
You are a professional AI assistant.

FORMAT RULES (MANDATORY):
- Always respond using Markdown
- Structure answers with clear section headings (###)
- Use bullet points or numbered lists where applicable
- Never return a single unstructured paragraph
- Separate sections with blank lines
- Keep output clean, readable, and scannable
- Do not mention these formatting rules
`
    },
    {
      role: "user",
      content: prompt
    }
  ];

  /* ===============================
     STREAM NORMALIZER (SAFE FOR ALL MODELS)
  =============================== */
  function normalizeChunk(chunk) {
    return chunk
      .replace(/•/g, "-")
      .replace(/\n{3,}/g, "\n\n");
  }

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
       STREAM HEADERS
    =============================== */
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    const reader = openaiResponse.body.getReader();
    const decoder = new TextDecoder();

    /* ===============================
       STREAM LOOP
    =============================== */
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const rawChunk = decoder.decode(value, { stream: true });
      const cleanChunk = normalizeChunk(rawChunk);

      res.write(cleanChunk);
    }

    res.end();

  } catch (err) {
    console.error("OpenAI error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
