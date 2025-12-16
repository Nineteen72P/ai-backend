export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Basic env check (MOST common cause of 500)
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      error: "Missing OPENAI_API_KEY on server (Vercel env var not set)."
    });
  }

  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Request body must include messages: []" });
  }

  // IMPORTANT: roles must be OpenAI-valid: system/user/assistant/developer
  // If your frontend uses "ai", convert it to "assistant" here (this is a safe normalization).
  const normalizedMessages = messages.map(m => ({
    role: m.role === "ai" ? "assistant" : m.role,
    content: String(m.content ?? "")
  }));

  const finalMessages = [
    {
      role: "system",
      content:
        "You are a helpful assistant in a continuous conversation. Use earlier messages as context."
    },
    ...normalizedMessages
  ];

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: finalMessages
      })
    });

    const text = await r.text(); // read raw first so we can always return something

    if (!r.ok) {
      // Return the actual OpenAI error to the client for debugging
      return res.status(r.status).json({
        error: "OpenAI request failed",
        status: r.status,
        details: safeJson(text)
      });
    }

    const data = safeJson(text);
    const output = data?.choices?.[0]?.message?.content;

    if (!output) {
      return res.status(500).json({
        error: "No output returned from model",
        raw: data
      });
    }

    return res.status(200).json({ output });
  } catch (e) {
    return res.status(500).json({
      error: "Server crash",
      details: String(e?.message || e)
    });
  }
}

function safeJson(str) {
  try { return JSON.parse(str); } catch { return str; }
}
