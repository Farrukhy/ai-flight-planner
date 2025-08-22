# export_waypoints.py
import math

def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371000
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) \
        * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return 2 * R * math.asin(math.sqrt(a))

def export_waypoints(waypoints, filename="mission.waypoints"):
    with open(filename, "w") as f:
        f.write("QGC WPL 110\n")  # Mission Planner header
        for i, (lat, lon, alt) in enumerate(waypoints):
            line = f"{i}\t0\t3\t16\t0\t0\t0\t0\t{lat}\t{lon}\t{alt}\t1\n"
            f.write(line)
    print(f"[+] Exported {len(waypoints)} waypoints → {filename}")

if __name__ == "__main__":
    # Example test: straight line mission
    waypoints = [
        (35.0, 127.0, 50),
        (35.0005, 127.0005, 50),
        (35.0010, 127.0010, 50)
    ]
    export_waypoints(waypoints)
