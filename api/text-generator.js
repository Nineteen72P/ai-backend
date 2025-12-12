export default async function handler(req, res) {
  // --- CORS ---
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
    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input
      })
    });

    const data = await openaiResponse.json();

    // 🔴 LOG EVERYTHING FOR DIAGNOSIS
    console.log("OPENAI STATUS:", openaiResponse.status);
    console.log("OPENAI RESPONSE:", JSON.stringify(data));

    // Handle OpenAI error explicitly
    if (data.error) {
      return res.status(500).json({
        error: "OpenAI error",
        details: data.error
      });
    }

    // Extract text
    let output = null;
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

    if (!output) {
      return res.status(500).json({
        error: "No output returned",
        raw: data
      });
    }

    return res.status(200).json({ output });
  } catch (err) {
    console.error("SERVER ERROR:", err);
    return res.status(500).json({ error: "Server crash" });
  }
}
