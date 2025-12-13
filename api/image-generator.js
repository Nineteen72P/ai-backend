const RATE_LIMIT = {};
const MAX_REQUESTS = 10;
const WINDOW_MS = 60 * 1000;

export default async function handler(req, res) {
  // --- CORS ---
  const allowedOrigin = "https://6e13f7-7f.myshopify.com";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // --- RATE LIMIT ---
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

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
const prompt = (body?.input || "").trim();
  if (!prompt) {
    return res.status(400).json({ error: "Missing prompt" });
  }

  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20000);

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
          model: "gpt-image-1",
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: prompt
                }
              ]
            }
          ]
        })
      }
    );

    const data = await openaiResponse.json();

  if (!openaiResponse.ok) {
  console.error("OPENAI IMAGE ERROR:", data);
  return res.status(openaiResponse.status).json(data);
}


    let imageBase64 = null;

    for (const item of data.output || []) {
      for (const block of item.content || []) {
        if (block.type === "output_image" && block.image_base64) {
          imageBase64 = block.image_base64;
          break;
        }
      }
      if (imageBase64) break;
    }

    if (!imageBase64) {
      return res.status(500).json({
        error: "No image returned",
        raw: data
      });
    }

    return res.status(200).json({
      image: `data:image/png;base64,${imageBase64}`
    });

  } catch (err) {
    console.error("IMAGE SERVER ERROR:", err);
    return res.status(500).json({ error: "Server crash" });
  }
}


