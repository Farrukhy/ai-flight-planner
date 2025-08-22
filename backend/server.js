// backend/server.js
import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
dotenv.config();

const app = express();
app.use(express.json());

// --- resolve the /web directory (sibling of /backend) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const webDir     = path.resolve(__dirname, "../web");
console.log("[static] serving", webDir);

// --- serve static files first ---
app.use(express.static(webDir));

// (optional CORS for development; harmless if same-origin)
app.use((req,res,next)=>{
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  next();
});

// --- config endpoint (front-end reads map style + terrain url) ---
app.get("/api/config", (req,res)=>{
  const key = process.env.MAPTILER_PUBLIC_KEY || "";
  // ✅ use a valid style id like streets-v2 or outdoor
  const styleId = "streets-v2";    // or "outdoor"
  const mapStyleUrl = key
    ? `https://api.maptiler.com/maps/${styleId}/style.json?key=${key}`
    : "https://demotiles.maplibre.org/style.json";
  const terrainDemUrl = key
    ? `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${key}`
    : null;
  res.json({ mapStyleUrl, terrainDemUrl });
});


// --- OpenAI proxy (keeps your key on the server) ---
app.post("/api/parse", async (req,res)=>{
  try{
    const { system, user } = req.body || {};
    if(!process.env.OPENAI_API_KEY) return res.status(500).send("Missing OPENAI_API_KEY");

    const body = {
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: system || "" },
        { role: "user",   content: user   || "" }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "Targets",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              targets: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    name: { type: "string" },
                    lat:  { type: "number" },
                    lon:  { type: "number" }
                  },
                  required: ["name","lat","lon"]
                }
              }
            },
            required: ["targets"]
          }
        }
      },
      temperature: 0.2
    };

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + process.env.OPENAI_API_KEY
      },
      body: JSON.stringify(body)
    });

    // propagate rate-limit headers
    ["retry-after",
     "x-ratelimit-remaining-requests","x-ratelimit-remaining-tokens",
     "x-ratelimit-limit-requests","x-ratelimit-limit-tokens"]
     .forEach(h=>{ const v = r.headers.get(h); if(v) res.set(h, v); });

    if(!r.ok){ return res.status(r.status).send(await r.text()); }

    const data = await r.json();
    let targets = [];
    if (data.output_parsed) targets = data.output_parsed.targets ?? [];
    else {
      const txt = data.output_text ?? (data.output?.[0]?.content?.[0]?.text ?? "");
      try { targets = txt ? (JSON.parse(txt).targets ?? []) : []; } catch { targets = []; }
    }
    res.json({ targets });
  }catch(err){
    res.status(500).send(String(err));
  }
});

// --- fallback: always return index.html for SPA routes ---
app.get("*", (req,res)=>{
  res.sendFile(path.join(webDir, "index.html"));
});

const PORT = process.env.PORT || 5173;
app.listen(PORT, ()=> console.log("Backend + static on http://localhost:"+PORT));
