/**
 * server.js - AI Flight Planner backend
 *
 * Features:
 *  - GET /api/config            => returns map style + VTOL specs
 *  - GET /api/geocode?q=...     => small proxy to Nominatim (tiny in-memory cache)
 *  - POST /api/ai-flight-planner => generate a VTOL flight plan (uses OpenAI)
 *
 * Environment:
 *  - OPENAI_API_KEY  (required)
 *  - MAPTILER_PUBLIC_KEY (optional)
 *
 * Notes:
 *  - Node 18+ recommended (built-in fetch). If using older Node, install node-fetch and uncomment import.
 *  - On Windows to set env for testing: `set OPENAI_API_KEY=sk-...` then `node server.js`
 */

import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import morgan from "morgan";

dotenv.config();

const PORT = process.env.PORT || 5173;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const MAPTILER_PUBLIC_KEY = process.env.MAPTILER_PUBLIC_KEY || "";

/* --- VTOL specs (tweak for your vehicle) --- */
const VTOL_SPECS = {
  type: "vtol",
  max_altitude_m: 3000,
  weight_kg: 17,
  cruise_speed_kmh: 100,
  max_speed_kmh: 140,
  range_km: 50,
  climb_rate_ms: 5,
  descent_rate_ms: 3,
  turn_radius_m: 50,
  takeoff_altitude_m: 50,
  cruise_altitude_m: 800,
  landing_approach_m: 100,
  loiter_radius_m: 30
};

const app = express();
app.use(express.json({ limit: "200kb" }));
app.use(helmet());
app.use(morgan("dev"));
app.use(cors({ origin: "*" }));

// Rate limiter (light during dev)
const limiter = rateLimit({
  windowMs: 15 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// small health
app.get("/", (_req, res) => {
  res.json({
    status: "OK",
    message: "AI Flight Planner API",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    endpoints: [
      "GET /api/config",
      "GET /api/geocode?q=...",
      "POST /api/ai-flight-planner"
    ]
  });
});

// config - used by client to verify backend + map/vehicle settings
app.get("/api/config", (_req, res) => {
  const styleId = "streets-v2";
  const mapStyleUrl = MAPTILER_PUBLIC_KEY
    ? `https://api.maptiler.com/maps/${styleId}/style.json?key=${MAPTILER_PUBLIC_KEY}`
    : "https://demotiles.maplibre.org/style.json";

  const terrainDemUrl = MAPTILER_PUBLIC_KEY
    ? `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${MAPTILER_PUBLIC_KEY}`
    : null;

  res.json({ ok: true, mapStyleUrl, terrainDemUrl, vehicle: VTOL_SPECS });
});

// tiny geocode proxy (cache)
const geoCache = new Map();
app.get("/api/geocode", async (req, res) => {
  try {
    const q = (req.query.q || "").toString().trim();
    if (!q) return res.json({ ok: false });

    if (geoCache.has(q)) return res.json({ ok: true, ...geoCache.get(q) });

    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("q", q);
    url.searchParams.set("limit", "1");

    const r = await fetch(url.toString(), { headers: { "User-Agent": "ai-flight-planner/1.0" } });
    if (!r.ok) return res.status(r.status).send(await r.text());
    const arr = await r.json();
    if (!arr?.length) return res.json({ ok: false });

    const hit = { name: arr[0].display_name, lat: +arr[0].lat, lon: +arr[0].lon };
    geoCache.set(q, hit);
    res.json({ ok: true, ...hit });
  } catch (e) {
    res.status(500).send(String(e));
  }
});

/* --- helpers --- */
function haversineKm(p1, p2) {
  const R = 6371;
  const dLat = (p2.lat - p1.lat) * Math.PI / 180;
  const dLon = (p2.lng - p1.lng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// deterministic fallback with VTOL-specific steps including loiter (safe U-turn)
function fallbackGenerateVTOLWaypoints(takeoff, mission, returnp, targetCount = 16) {
  targetCount = Math.max(8, Math.min(24, targetCount));
  const wps = [];

  // 1) Takeoff (vertical)
  wps.push({
    seq: wps.length + 1,
    lat: takeoff.lat,
    lng: takeoff.lng,
    alt: Math.max(5, Math.min(takeoff.alt || 50, VTOL_SPECS.max_altitude_m)),
    speed: Math.min(VTOL_SPECS.cruise_speed_kmh, VTOL_SPECS.max_speed_kmh),
    action: "TAKEOFF",
    description: "Vertical takeoff (VTOL)"
  });

  // 2) Climb / transition waypoint(s)
  const transitionAlt = Math.min(VTOL_SPECS.cruise_altitude_m, Math.max(80, (takeoff.alt || 50) + 100));
  wps.push({
    seq: wps.length + 1,
    lat: takeoff.lat,
    lng: takeoff.lng,
    alt: transitionAlt,
    speed: Math.min(VTOL_SPECS.max_speed_kmh, VTOL_SPECS.cruise_speed_kmh),
    action: "VTOL_TRANSITION",
    description: "Transition to forward flight"
  });

  // 3) Cruise leg to mission - interpolate waypoints
  const leg1Count = Math.max(2, Math.floor((targetCount - 6) / 2));
  for (let i = 1; i <= leg1Count; i++) {
    const t = i / (leg1Count + 1);
    wps.push({
      seq: wps.length + 1,
      lat: takeoff.lat + (mission.lat - takeoff.lat) * t,
      lng: takeoff.lng + (mission.lng - takeoff.lng) * t,
      alt: transitionAlt,
      speed: VTOL_SPECS.cruise_speed_kmh,
      action: "WAYPOINT",
      description: `Cruise to mission (${i}/${leg1Count})`
    });
  }

  // 4) Mission - include MISSION action
  wps.push({
    seq: wps.length + 1,
    lat: mission.lat,
    lng: mission.lng,
    alt: Math.max(30, mission.alt || 100),
    speed: 0,
    action: "MISSION",
    description: "Mission point - perform task(s)"
  });

  // 5) Immediately after mission: LOITER_TO_ALT for U-turn / safe turn if necessary
  //    This instructs vehicle to loiter at a given radius & altitude while turning.
  wps.push({
    seq: wps.length + 1,
    lat: mission.lat,
    lng: mission.lng,
    alt: Math.max(30, mission.alt || 100),
    speed: 0,
    action: "LOITER_TO_ALT",
    description: `Loiter at altitude for safe turning (radius ${VTOL_SPECS.loiter_radius_m}m)`
  });

  // 6) Return leg interpolation
  const leg2Count = Math.max(2, (targetCount - wps.length - 2));
  for (let i = 1; i <= leg2Count; i++) {
    const t = i / (leg2Count + 1);
    wps.push({
      seq: wps.length + 1,
      lat: mission.lat + (returnp.lat - mission.lat) * t,
      lng: mission.lng + (returnp.lng - mission.lng) * t,
      alt: transitionAlt,
      speed: VTOL_SPECS.cruise_speed_kmh,
      action: "WAYPOINT",
      description: `Return leg (${i}/${leg2Count})`
    });
  }

  // 7) Transition back to VTOL if needed (VTOL_TRANSITION back to hover)
  wps.push({
    seq: wps.length + 1,
    lat: returnp.lat,
    lng: returnp.lng,
    alt: Math.max(10, returnp.alt || 20),
    speed: Math.min(30, VTOL_SPECS.cruise_speed_kmh),
    action: "VTOL_TRANSITION",
    description: "Transition to VTOL/hover for landing"
  });

  // 8) LAND (final)
  wps.push({
    seq: wps.length + 1,
    lat: returnp.lat,
    lng: returnp.lng,
    alt: Math.max(2, returnp.alt || 10),
    speed: 0,
    action: "LAND",
    description: "Vertical landing"
  });

  // ensure seq ascending
  wps.forEach((wp, idx) => (wp.seq = idx + 1));
  return wps;
}

/**
 * Main endpoint: POST /api/ai-flight-planner
 * Body:
 * { takeoff: {lat,lng,alt?}, mission: {lat,lng,alt?}, return_point: {lat,lng,alt?}, user_prompt: string }
 *
 * Returns:
 * { success: true, waypoints: [...], summary: {...} }
 */
app.post("/api/ai-flight-planner", async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY environment variable." });
    }

    const body = req.body || {};
    const takeoff = body.takeoff;
    const mission = body.mission;
    const return_point = body.return_point;
    const user_prompt = (body.user_prompt || "").toString().slice(0, 1200);

    if (!takeoff || !mission || !return_point) {
      return res.status(400).json({ error: "Missing required points: takeoff, mission, return_point" });
    }
    if (!('lat' in takeoff) || !('lng' in takeoff) ||
        !('lat' in mission) || !('lng' in mission) ||
        !('lat' in return_point) || !('lng' in return_point)) {
      return res.status(400).json({ error: "All points must include lat & lng" });
    }

    const d1 = haversineKm(takeoff, mission);
    const d2 = haversineKm(mission, return_point);
    const total_km = d1 + d2;

    // quick safety check
    if (total_km > VTOL_SPECS.range_km * 0.98) {
      return res.status(400).json({ error: `Mission distance ${total_km.toFixed(1)} km likely exceeds vehicle range ${VTOL_SPECS.range_km} km.` });
    }

    // Compose a robust system prompt for OpenAI to produce a JSON array
    const systemPrompt = `
You are an AI flight planner for a VTOL drone. Vehicle specs (JSON):\n${JSON.stringify(VTOL_SPECS, null, 2)}

Task:
Generate 15-20 waypoints for a VTOL mission using the provided reference points (takeoff, mission, return).
Return EXACTLY a JSON array (no additional text) of waypoints with fields:
  seq, lat, lng, alt (meters AGL), speed (km/h), action, description

Allowed actions (strings): TAKEOFF, VTOL_TRANSITION, LOITER_TO_ALT, WAYPOINT, MISSION, LAND, RTL

Rules:
- First waypoint MUST be TAKEOFF at takeoff coords.
- Include a VTOL_TRANSITION after takeoff to indicate switching to forward flight.
- Include a MISSION waypoint at mission coords.
- Insert a LOITER_TO_ALT waypoint (or a short loiter sequence) right after mission if performing turns/UTurns is necessary.
- Include return leg and final LAND at return coords.
- Total waypoints: between 12 and 24.
- Use numeric values only. No extra commentary — output only the JSON array.
`;

    const userMessage = `Takeoff: ${takeoff.lat},${takeoff.lng}, alt:${takeoff.alt || "auto"}
Mission: ${mission.lat},${mission.lng}, alt:${mission.alt || "auto"}
Return: ${return_point.lat},${return_point.lng}, alt:${return_point.alt || "auto"}
Distance (km): ${total_km.toFixed(3)}
User request: ${user_prompt || "standard surveillance mission"}`;

    // Build OpenAI request body
    const openaiBody = {
      model: "gpt-4o-mini", // change if you prefer another model
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      temperature: 0.15,
      max_tokens: 1500
    };

    let aiText;
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify(openaiBody)
      });

      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`OpenAI API returned ${r.status}: ${txt}`);
      }
      const data = await r.json();
      aiText = (data?.choices?.[0]?.message?.content || "").toString();
    } catch (err) {
      console.error("OpenAI request failed:", err?.message || err);
      // fallback deterministic generation
      const fallback = fallbackGenerateVTOLWaypoints(
        { lat: +takeoff.lat, lng: +takeoff.lng, alt: +(takeoff.alt || 50) },
        { lat: +mission.lat, lng: +mission.lng, alt: +(mission.alt || 120) },
        { lat: +return_point.lat, lng: +return_point.lng, alt: +(return_point.alt || 20) },
        16
      );

      const summary = {
        total_waypoints: fallback.length,
        total_distance_km: total_km.toFixed(2),
        estimated_flight_time_min: Math.round(total_km / (VTOL_SPECS.cruise_speed_kmh / 60)),
        vtol_specs: VTOL_SPECS
      };

      return res.json({ success: true, waypoints: fallback, summary, fallback: true, error: String(err?.message || err) });
    }

    // Try parse AI output as JSON array or object with waypoints
    let parsedWaypoints = null;
    try {
      const parsedRoot = JSON.parse(aiText);
      if (Array.isArray(parsedRoot)) parsedWaypoints = parsedRoot;
      else if (parsedRoot && Array.isArray(parsedRoot.waypoints)) parsedWaypoints = parsedRoot.waypoints;
      else throw new Error("unexpected JSON root");
    } catch (parseErr) {
      // try to extract first JSON array substring
      const m = aiText.match(/\[[\s\S]*\]/);
      if (m) {
        try {
          parsedWaypoints = JSON.parse(m[0]);
        } catch (e2) {
          console.error("failed to parse substring:", e2.message);
        }
      }
    }

    if (!parsedWaypoints || !Array.isArray(parsedWaypoints) || parsedWaypoints.length === 0) {
      console.error("AI returned unparsable text. returning fallback. aiText length:", aiText.length);
      const fallback = fallbackGenerateVTOLWaypoints(
        { lat: +takeoff.lat, lng: +takeoff.lng, alt: +(takeoff.alt || 50) },
        { lat: +mission.lat, lng: +mission.lng, alt: +(mission.alt || 120) },
        { lat: +return_point.lat, lng: +return_point.lng, alt: +(return_point.alt || 20) },
        16
      );

      const summary = {
        total_waypoints: fallback.length,
        total_distance_km: total_km.toFixed(2),
        estimated_flight_time_min: Math.round(total_km / (VTOL_SPECS.cruise_speed_kmh / 60)),
        vtol_specs: VTOL_SPECS
      };

      return res.json({ success: true, waypoints: fallback, summary, fallback: true, ai_debug: aiText.substring(0, 2000) });
    }

    // Normalize and validate parsed waypoints
    const formatted = parsedWaypoints.map((wp, idx) => {
      const lat = Number(wp.lat ?? wp.latitude ?? 0);
      const lng = Number(wp.lng ?? wp.longitude ?? wp.lon ?? 0);
      let alt = Number(wp.alt ?? wp.altitude ?? (VTOL_SPECS.takeoff_altitude_m || 50));
      if (!isFinite(alt)) alt = VTOL_SPECS.takeoff_altitude_m || 50;
      alt = Math.min(VTOL_SPECS.max_altitude_m, Math.max(0, alt));

      const speed = Math.min(VTOL_SPECS.max_speed_kmh, Number(wp.speed ?? VTOL_SPECS.cruise_speed_kmh));
      const action = (wp.action || wp.cmd || wp.type || "WAYPOINT").toString().toUpperCase();
      const description = wp.description || wp.desc || wp.note || `WP ${idx + 1}`;

      return {
        seq: idx + 1,
        lat,
        lng,
        alt,
        speed: isFinite(speed) ? speed : VTOL_SPECS.cruise_speed_kmh,
        action,
        description
      };
    });

    // compute summary metrics
    const totalDistance = formatted.reduce((acc, cur, i, arr) => {
      if (i === 0) return 0;
      return acc + haversineKm(arr[i - 1], cur);
    }, 0);

    const summary = {
      total_waypoints: formatted.length,
      total_distance_km: totalDistance.toFixed(2),
      estimated_flight_time_min: Math.round(totalDistance / (VTOL_SPECS.cruise_speed_kmh / 60)),
      vtol_specs: VTOL_SPECS
    };

    return res.json({ success: true, waypoints: formatted, summary, ai_response_snippet: aiText.substring(0, 2000) });
  } catch (err) {
    console.error("AI Flight Planner error:", err);
    res.status(500).json({ error: String(err) });
  }
});

// Not found
app.use("*", (req, res) => {
  res.status(404).json({ error: "Route not found", route: req.originalUrl });
});

// Start
app.listen(PORT, () => {
  console.log(`🚁 AI Flight Planner running on http://localhost:${PORT}`);
  console.log(`OpenAI key: ${OPENAI_API_KEY ? "✅ set" : "❌ missing"}`);
  console.log(`MapTiler key: ${MAPTILER_PUBLIC_KEY ? "✅ set" : "❌ missing"}`);
});
