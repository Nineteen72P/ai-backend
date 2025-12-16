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
     INPUT VALIDATION
  =============================== */
  const { messages } = req.body;

  if (!Array.isArray(messages)) {
    return res.status(400).json({
      error: "Request body must include a messages array"
    });
  }

  /* ===============================
     SYSTEM MESSAGE (ONCE)
     DO NOT REMOVE
  =============================== */
  const finalMessages = [
    {
      role: "system",
      content:
        "You are a helpful AI assistant in a continuous conversation. " +
        "You must remember and use information the user shares earlier in the conversation, " +
        "including personal details they voluntarily provide, to answer follow-up questions accurately."
    },
    ...messages
  ];

  try {
    /* ===============================
       OPENAI CHAT COMPLETION
    =============================== */
    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: finalMessages
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("OPENAI ERROR:", data);
      return res.status(500).json({ error: "OpenAI request failed" });
    }

    const output = data.choices?.[0]?.message?.content;

    if (!output) {
      return res.status(500).json({ error: "No output returned from model" });
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
