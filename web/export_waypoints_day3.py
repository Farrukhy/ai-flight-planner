import math

def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371000  # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = math.sin(dphi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda/2)**2
    return R * (2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))

def generate_waypoints(start, end, spacing=1000):
    lat1, lon1 = start
    lat2, lon2 = end
    distance = haversine_distance(lat1, lon1, lat2, lon2)
    num_points = int(distance // spacing)

    waypoints = []
    for i in range(num_points + 1):
        f = i / num_points
        lat = lat1 + (lat2 - lat1) * f
        lon = lon1 + (lon2 - lon1) * f
        waypoints.append((lat, lon, 100))  # altitude fixed at 100m
    return waypoints

def export_to_missionplanner(waypoints, filename="mission_day3.waypoints"):
    with open(filename, "w") as f:
        f.write("QGC WPL 110\n")  # Mission Planner header
        for i, (lat, lon, alt) in enumerate(waypoints):
            f.write(f"{i}\t0\t3\t16\t0\t0\t0\t0\t{lat}\t{lon}\t{alt}\t1\n")
    print(f"✅ Saved {len(waypoints)} waypoints to {filename}")

if __name__ == "__main__":
    start = (37.7749, -122.4194)  # San Francisco
    end = (34.0522, -118.2437)    # Los Angeles
    waypoints = generate_waypoints(start, end, spacing=50000)  # every 50km
    export_to_missionplanner(waypoints)
