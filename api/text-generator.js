const RATE_LIMIT = {};
const MAX_REQUESTS = 20;        // max requests
const WINDOW_MS = 60 * 1000;    // per 1 minute

export default async function handler(req, res) {
  // --- CORS ---
   const allowedOrigin = "https://6e13f7-7f.myshopify.com";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  
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

  const controller = new AbortController();
  setTimeout(() => controller.abort(), 15000); // 15s timeout

  const response = await fetch("https://api.openai.com/v1/responses", {
  method: "POST",
  signal: controller.signal,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
  },
  body: JSON.stringify({
    model: "gpt-4o-mini",
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
