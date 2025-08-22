# AI Flight Planner — 8-Week Roadmap

Owner: Farrukhy  
Goal: Production-ready AI mission planning with terrain-aware safe routes.

## Week 1 (DONE): AI Parsing + Terrain Viz + Safety
**Deliverables:**  
- OpenAI parsing (structured JSON), basic geocoding heuristics.  
- MapLibre + MapTiler terrain, hillshade, 3D buildings.  
- Route overlay with **green/yellow/red** clearance vs buffer.  
**Demo:** “Daejeon → Jeonju”, “Fly to mountain lake”.  
**Success metric:** Teammates say “ship it for a pilot”.

---

## Week 2: Auto-Altitude & Elevation Profile
- [ ] Automatically raise altitude where clearance < buffer.  
- [ ] Add elevation/AGL profile chart.  
- [ ] Increase route sampling + performance tune.
**Deliverable:** Button “Auto-fix altitude” + profile chart export (PNG).  
**Risk:** Terrain sampling perf → cache samples.

## Week 3: Exporters & Formats
- [ ] Export to Mission Planner / QGC (waypoints, altitudes).  
- [ ] KML/GPX export for Google Earth.  
- [ ] CRS conversions (EPSG:4326↔local UTM).
**Deliverable:** `Export` menu with MP, QGC, KML, GPX.

## Week 4: UI/UX Polish & Error Handling
- [ ] Waypoint labels + inline editing.  
- [ ] Parse confirmation when multiple places match.  
- [ ] Better errors (rate limits, missing tiles).
**Deliverable:** Clean demo UX; no red console spam.

## Week 5: Constraints & No-Fly Zones
- [ ] Upload/import polygons (NFZ).  
- [ ] Route avoids NFZ; warnings for boundary proximity.  
- [ ] Basic route optimizer for multi-waypoint missions.
**Deliverable:** Draws a safe route avoiding NFZs.

## Week 6: Weather & Wind Layer (MVP)
- [ ] Fetch wind @ altitude + basic effect on ETA.  
- [ ] Weather overlay toggle (cloud base / precipitation where available).
**Deliverable:** Weather-aware briefing panel.

## Week 7: Persistence & Sharing
- [ ] Save missions server-side (SQLite).  
- [ ] Shareable read-only links.  
- [ ] Simple auth (token link / password).
**Deliverable:** “Save mission” + “Share link”.

## Week 8: Hardening & Launch
- [ ] Perf pass (bundle, caching, CDNs).  
- [ ] Logging & metrics.  
- [ ] One-click deploy (Render/Railway backend + Netlify/Vercel frontend) with envs.
**Deliverable:** Public pilot URL + ops checklist.

---

## Risks / Dependencies
- OpenAI API billing & model limits.  
- Map tiles/elevation availability & quotas.  
- NFZ/Weather data licensing (TBD).

## Success Metrics
- T < 10s parse → route → clearance.  
- 0 blockers during demo (fallback ready).  
- Pilot team adopts tool for real missions.
