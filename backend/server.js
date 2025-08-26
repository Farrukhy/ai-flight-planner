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

// --- Simple geocode (OSM Nominatim) with tiny cache ---
const geoCache = new Map();

app.get("/api/geocode", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) return res.json({ ok:false });

    if (geoCache.has(q)) return res.json({ ok:true, ...geoCache.get(q) });

    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("q", q);
    url.searchParams.set("limit", "1");

    const r = await fetch(url, { headers: { "User-Agent": "ai-flight-planner/1.0" }});
    if (!r.ok) return res.status(r.status).send(await r.text());
    const arr = await r.json();
    if (!arr?.length) return res.json({ ok:false });

    const hit = { name: arr[0].display_name, lat: +arr[0].lat, lon: +arr[0].lon };
    geoCache.set(q, hit);
    res.json({ ok:true, ...hit });
  } catch (e) {
    res.status(500).send(String(e));
  }
});

// --- config endpoint (front-end reads map style + terrain url) ---
app.get("/api/config", (req, res) => {
  const key = process.env.MAPTILER_PUBLIC_KEY || "";
  const styleId = "streets-v2"; // or "outdoor"
  const mapStyleUrl = key
    ? `https://api.maptiler.com/maps/${styleId}/style.json?key=${key}`
    : "https://demotiles.maplibre.org/style.json";
  const terrainDemUrl = key
    ? `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${key}`
    : null;

  // VTOL defaults
  const vehicle = {
    type: process.env.UAV_TYPE || "vtol",
    material: process.env.UAV_MATERIAL || "composite",
    size_mm: process.env.UAV_SIZE_MM || "2840x1650",
    propulsion: process.env.UAV_PROPULSION || "gasoline",
    mtow_kg: parseFloat(process.env.UAV_MTOW_KG || "16.5"),
    max_payload_kg: parseFloat(process.env.UAV_MAX_PAYLOAD_KG || "2"),
    nominal_flight_time_hr: parseFloat(process.env.UAV_FLIGHT_TIME_HR || "4"),
    cruise_kmh: parseFloat(process.env.UAV_CRUISE_KMH || "95"),
    max_speed_kmh: parseFloat(process.env.UAV_MAX_KMH || "140"),
    tol: process.env.UAV_TOL || "VTOL"
  };

  res.json({ mapStyleUrl, terrainDemUrl, vehicle });
});



// --- OpenAI proxy (keeps your key on the server) ---
app.post("/api/parse", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) return res.status(500).send("Missing OPENAI_API_KEY");

    const { user } = req.body || {};
    const SYSTEM_PROMPT =
      `You parse drone mission text into structured JSON. Return STRICT JSON and NOTHING else.
Schema:
{
  "mission_type": "survey" | "transit" | "mapping" | "inspection" | "photography" | "other",
  "targets": [  // list waypoints in order (if any). Allow name-only if coords unknown
    { "name": "string", "lat": number|null, "lon": number|null }
  ],
  "altitude": { "value": number|null, "unit": "m"|"ft", "agl": boolean|null }, // global default if not per-waypoint
  "speed": { "value": number|null, "unit": "mps"|"kmh"|"knots" }, // flight speed if specified
  "photo_interval": { "every_m": number|null, "every_s": number|null }, // accept either
  "timing": { "start_time": "string|null", "max_duration_min": number|null },
  "avoid": [ "string" ], // textual constraints like 'avoid residential area east side'
  "notes": [ "string" ], // any special mission instructions you detected
  "warnings": [ "string" ] // parsing caveats/ambiguities
}
Parsing rules:
- Accept multi-waypoint missions; create targets in the spoken order.
- Extract altitude units (m/ft) AND whether it's AGL if mentioned (AGL, above ground), else null.
- If altitude only appears per segment, put the most global/default altitude in "altitude".
- Speed: detect units; normalize as given (don't convert).
- Photo intervals: accept "every 100m" (every_m) or "every 5s" (every_s).
- Avoidance: push any 'avoid/keep away/stay clear/no-fly' phrases or regions as strings.
- Timing: extract ranges like 'within 20 minutes'.
- If coords are not in text, leave lat/lon null but keep names (e.g., 'valley east', 'mountain lake').
- Be concise. Do NOT invent data.`;

    const body = {
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: user || "" }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "MissionParse",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              mission_type: { type: "string" },
              targets: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    name: { type: "string" },
                    lat: { type: ["number","null"] },
                    lon: { type: ["number","null"] }
                  },
                  required: ["name","lat","lon"]
                }
              },
              altitude: {
                type: "object",
                additionalProperties: false,
                properties: {
                  value: { type: ["number","null"] },
                  unit:  { type: "string", enum: ["m","ft"] },
                  agl:   { type: ["boolean","null"] }
                },
                required: ["value","unit","agl"]
              },
              speed: {
                type: "object",
                additionalProperties: false,
                properties: {
                  value: { type: ["number","null"] },
                  unit:  { type: "string", enum: ["mps","kmh","knots"] }
                },
                required: ["value","unit"]
              },
              photo_interval: {
                type: "object",
                additionalProperties: false,
                properties: {
                  every_m: { type: ["number","null"] },
                  every_s: { type: ["number","null"] }
                },
                required: ["every_m","every_s"]
              },
              timing: {
                type: "object",
                additionalProperties: false,
                properties: {
                  start_time: { type: ["string","null"] },
                  max_duration_min: { type: ["number","null"] }
                },
                required: ["start_time","max_duration_min"]
              },
              avoid: { type: "array", items: { type: "string" } },
              notes: { type: "array", items: { type: "string" } },
              warnings: { type: "array", items: { type: "string" } }
            },
            required: ["mission_type","targets","altitude","speed","photo_interval","timing","avoid","notes","warnings"]
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

    ["retry-after","x-ratelimit-remaining-requests","x-ratelimit-remaining-tokens",
     "x-ratelimit-limit-requests","x-ratelimit-limit-tokens"]
     .forEach(h=>{ const v = r.headers.get(h); if(v) res.set(h, v); });

    if (!r.ok) return res.status(r.status).send(await r.text());
    const data = await r.json();

    let parsed = null;
    if (data.output_parsed) parsed = data.output_parsed;
    else {
      const txt = data.output_text ?? (data.output?.[0]?.content?.[0]?.text ?? "");
      try { parsed = JSON.parse(txt); } catch { parsed = null; }
    }
    if (!parsed) return res.status(502).send("Parse failed.");

    // Minimal server-side validation + helpful warnings
    const warnings = [];
    if (!parsed.targets || !Array.isArray(parsed.targets) || parsed.targets.length === 0) {
      warnings.push("No targets detected.");
    } else {
      parsed.targets = parsed.targets.map(t => ({
        name: t.name?.slice(0,64) || "wp",
        lat: (typeof t.lat === "number" && Math.abs(t.lat) <= 90) ? t.lat : null,
        lon: (typeof t.lon === "number" && Math.abs(t.lon) <= 180) ? t.lon : null
      }));
    }
    if (parsed.altitude?.value != null && parsed.altitude?.unit === "ft") {
      // keep original units but compute derived meters for UI
      parsed.altitude_m_derived = Math.round(parsed.altitude.value * 0.3048);
    }
    if (warnings.length) parsed.warnings = [...(parsed.warnings||[]), ...warnings];

    res.json({ parsed });
  } catch (err) {
    res.status(500).send(String(err));
  }
});


// --- fallback: always return index.html for SPA routes ---
app.get("*", (req,res)=>{
  res.sendFile(path.join(webDir, "index.html"));
});

const PORT = process.env.PORT || 5173;
app.listen(PORT, ()=> console.log("Backend + static on http://localhost:"+PORT));
