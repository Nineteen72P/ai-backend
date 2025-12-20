const RATE_LIMIT = {};
const MAX_REQUESTS = 10;
const WINDOW_MS = 60 * 1000;

export default async function handler(req, res) {
  /* ===============================
     CORS (SHOPIFY SAFE)
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
     BODY PARSE (ROBUST)
  =============================== */
  let body = "";
  await new Promise(resolve => {
    req.on("data", chunk => (body += chunk));
    req.on("end", resolve);
  });

  let input = "";

  try {
    const parsed = JSON.parse(body);
    input = parsed.input || parsed.prompt || "";
  } catch {
    const match =
      body.match(/input=([^&]+)/) ||
      body.match(/prompt=([^&]+)/);

    if (match) {
      input = decodeURIComponent(match[1].replace(/\+/g, " "));
    }
  }

  input = (input || "").trim();

  if (!input) {
    return res.status(400).json({ error: "Missing input" });
  }

  /* ===============================
     OPENAI IMAGE REQUEST
  =============================== */
  try {
    const imageResponse = await fetch(
      "https://api.openai.com/v1/images/generations",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-image-1",
          prompt: input,
          size: "1024x1024"
        })
      }
    );

    const raw = await imageResponse.text();
    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      return res.status(500).json({
        error: "Invalid OpenAI image response"
      });
    }

    if (!imageResponse.ok) {
      return res.status(imageResponse.status).json({
        error: "OpenAI image error",
        openai: data
      });
    }

    const imgData = data?.data?.[0];

    if (!imgData) {
      return res.status(500).json({ error: "No image data returned" });
    }

    // ✅ SUPPORT BOTH URL AND BASE64
    let image;

    if (imgData.url) {
      image = imgData.url;
    } else if (imgData.b64_json) {
      image = `data:image/png;base64,${imgData.b64_json}`;
    } else {
      return res.status(500).json({ error: "Unsupported image format" });
    }

    /* ===============================
       SUCCESS
    =============================== */
    return res.status(200).json({ image });

  } catch (err) {
    console.error("IMAGE SERVER ERROR:", err);
    return res.status(500).json({ error: "Server crash" });
  }
}
