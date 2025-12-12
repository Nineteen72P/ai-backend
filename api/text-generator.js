export default async function handler(req, res) {
  // --- CORS (required for Shopify) ---
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const input = (req.body?.input || "").trim();
  if (!input) {
    return res.status(400).json({ error: "Missing input" });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: input
      })
    });

    const data = await response.json();

    // 🔑 Extract text safely from Responses API
    let output = "No response from AI.";

    if (Array.isArray(data.output)) {
      for (const item of data.output) {
        if (item.content) {
          for (const block of item.content) {
            if (block.type === "output_text") {
              output = block.text;
              break;
            }
          }
        }
      }
    }

    return res.status(200).json({ output });
  } catch (err) {
    console.error("AI ERROR:", err);
    return res.status(500).json({ error: "AI request failed" });
  }
}
