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
    // Try form or raw
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
     OPENAI IMAGE GENERATION
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
      console.error("OPENAI IMAGE NON-JSON:", raw);
      return res.status(500).json({
        error: "Invalid image response"
      });
    }

    if (!imageResponse.ok) {
      console.error("OPENAI IMAGE ERROR:", data);
      return res.status(500).json({
        error: "Image generation failed"
      });
    }

    const image = data?.data?.[0]?.url || null;

    if (!image) {
      return res.status(500).json({
        error: "No image returned",
        raw: data
      });
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
