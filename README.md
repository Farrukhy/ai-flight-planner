# AI Flight Planner

Mission: parse natural-language missions into coordinates and visualize a terrain-aware route.

**Week 1 Deliverable:** Demo-ready app with AI parsing + 3D terrain + safety analysis.

---

## Features (Week 1)

- **AI Mission Parsing (Day 4):**
  - OpenAI Responses API with structured JSON (`text.format` + JSON schema).
  - Extracts coordinates from free text (decimal, DMS, map links) and validates ranges.
  - Fallback geocoding is removed in prod (was used during prototyping).

- **Terrain Visualization & Safety (Day 5):**
  - MapLibre GL + MapTiler Terrain-RGB.
  - Hillshade + optional 3D buildings.
  - Route overlay with **green / yellow / red** segments based on terrain clearance vs user buffer.
  - Summary: low-clearance count and minimum clearance.

- **Demo Reliability:**
  - Server-side OpenAI proxy (API key hidden).
  - Optional “demo mode” fallback if OpenAI quota/rate limits are hit.

---

## Repo Structure


ai-flight-planner/
backend/ # Express server (OpenAI proxy + serves /web)
server.js
package.json
.env.example # copy to .env and fill in values
web/ # Static frontend (index.html + MapLibre app)
index.html
README.md
.gitignore
