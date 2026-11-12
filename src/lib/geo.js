// Where the phone is, addresses → coordinates, and driving routes. Uses OpenStreetMap's free
// services (Nominatim for addresses, OSRM for routes), which work worldwide without a key.
export function currentPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) { reject(new Error("Location isn't available on this device.")); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => reject(new Error(err && err.code === 1 ? "Allow location so Motiq can find places near you." : "Couldn't find your location. Try again outside or with GPS on.")),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000, ...options }
    );
  });
}

export async function geocode(query, near) {
  const params = new URLSearchParams({ format: "json", limit: "1", q: query });
  if (near) { const d = 0.5; params.set("viewbox", `${near.lon - d},${near.lat + d},${near.lon + d},${near.lat - d}`); }
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("Couldn't look up that address.");
  const data = await res.json();
  if (!data || !data.length) throw new Error("No match for that address.");
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), label: data[0].display_name };
}

export async function drivingRoute(from, to) {
  const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson`);
  if (!res.ok) throw new Error("Couldn't find a route.");
  const data = await res.json();
  const route = data && data.routes && data.routes[0];
  if (!route) throw new Error("No route between those places.");
  let coords = route.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
  if (coords.length > 150) { const step = Math.ceil(coords.length / 150); coords = coords.filter((_, i) => i % step === 0 || i === coords.length - 1); }
  return { km: route.distance / 1000, sec: route.duration, coords };
}

// Opens turn-by-turn directions in the phone's maps app.
export const directionsUrl = (lat, lon) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
