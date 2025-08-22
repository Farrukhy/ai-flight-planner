# Monday Check-in — AI Flight Planner (10–15 min)

## 1) What we built (Week 1)
- Parse natural-language missions into waypoints (OpenAI structured JSON).
- 3D terrain map (MapLibre + MapTiler), hillshade, and 3D buildings.
- Safety analysis: colors route segments by clearance vs buffer; min clearance summary.
- Backend proxy hides OpenAI key; MapTiler key restricted by domain.
- Demo fallback in case of API rate limit.

## 2) Live demo flow (3 minutes)
1. Type: “Fly from Daejeon to Seoul” → **Parse with AI**.  
2. See parsed waypoints + validation.  
3. Set Cruise Altitude AGL + Buffer → **Draw Route**.  
4. Show green/yellow/red segments; adjust altitude to clear red sections.

## 3) Why it matters
- Speeds mission planning from minutes to seconds.  
- Terrain-aware safety reduces risk.  
- Ready to plug into Mission Planner / QGC exporters.

## 4) What’s next (Week 2–3)
- Auto-altitude correction + elevation profile chart.  
- Exporters (MP/QGC/KML/GPX).  
- UI polish: labels, edit, confirmations.

## 5) Asks / Decision
- Enable **OpenAI API billing** (low, controllable cost; set monthly cap).  
- Optional: MapTiler plan for higher tile quotas if needed for team usage.

## 6) Q&A
- Costs, limits, data sources, roadmap.
