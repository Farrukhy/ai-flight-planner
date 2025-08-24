# AI Flight Planner — VTOL Focus

## Prompt Example (operator input)

“VTOL VE-20, cruise 100 km/h, climb 3 m/s, min turn radius 120 m, takeoff VTOL to 60 m AGL, transition to FW, land VTOL at <lat,lon>.”
(Specs, flight time, payload, endurance, range, engine type)

Pick VTOL model → start with spec sheet.
Endurance (battery/fuel).
Max payload.
Max range.
Cruise speed.
Ceiling (max altitude).

## Current Status
- Code already generates straight-line, fixed-altitude waypoints (demo).
- Export works to Mission Planner format (.waypoints).

## Next Steps (VTOL-specific)
1. Terrain-aware altitudes (AGL + buffer).
2. Vehicle-aware turns + climb/descent limits.
3. VTOL mission phases: **takeoff → transition → cruise → transition back → land**.
4. Exporters for **Mission Planner** + **QGroundControl**.

## Key Point (CEO’s Question)
👉 *Yes, AI can generate accurate mission waypoints for VTOL.*  

### Why?
- Operator gives the **specs in plain language** (speed, climb rate, transition, etc.).
- AI converts them into a **structured mission plan**.
- Python verifies rules (terrain, turns, climb rates) → exports to flight software.

### Why it works without pilot experience
- Flight rules = **math + vehicle specs**, not pilot intuition.  
- AI + Python enforce these automatically → safe & consistent mission planning.  
- Once VTOL logic is encoded, **any operator** can plan missions in seconds.
