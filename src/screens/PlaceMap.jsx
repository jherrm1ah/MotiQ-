// A real street map (OpenStreetMap) of the places around you. Pins are coloured by category;
// tap one to open the place.
import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useTheme } from "../design.jsx";

export default function PlaceMap({ here, places, colorOf, onPick }) {
  const { CARD_ALT, SUB, TEXT, mode } = useTheme();
  const box = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);

  useEffect(() => {
    if (!box.current || map.current) return;
    map.current = L.map(box.current, { zoomControl: false, attributionControl: true }).setView([here.lat, here.lon], 14);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => { map.current && map.current.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    if (!map.current) return;
    layer.current.clearLayers();
    L.circleMarker([here.lat, here.lon], { radius: 9, color: "#fff", weight: 3, fillColor: "#212121", fillOpacity: 1 }).addTo(layer.current).bindTooltip("You");
    const pts = [[here.lat, here.lon]];
    for (const p of places.slice(0, 60)) {
      L.circleMarker([p.lat, p.lon], { radius: 8, color: "#fff", weight: 2, fillColor: colorOf(p), fillOpacity: 1 })
        .addTo(layer.current).bindTooltip(p.name).on("click", () => onPick(p));
      pts.push([p.lat, p.lon]);
    }
    if (pts.length > 1) map.current.fitBounds(pts, { padding: [28, 28], maxZoom: 16 });
  }, [places, here.lat, here.lon]);

  return (
    <div className="overflow-hidden" style={{ borderRadius: 22, backgroundColor: CARD_ALT }}>
      <div ref={box} role="application" aria-label={`Map of ${places.length} places around you`} style={{ height: 220, filter: mode === "dark" ? "brightness(0.8) contrast(1.1) saturate(0.7)" : "none" }} />
      <div className="flex items-center justify-between px-4 pb-3.5 pt-3">
        <span className="text-xs" style={{ color: SUB }}>Tap a pin to see the place</span>
        <span className="text-xs font-semibold" style={{ color: TEXT }}>{places.length} nearby</span>
      </div>
    </div>
  );
}
