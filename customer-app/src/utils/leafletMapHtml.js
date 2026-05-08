function safeNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normCoord(coord) {
  if (!coord) return null;
  const latitude = safeNum(coord.latitude);
  const longitude = safeNum(coord.longitude);
  if (latitude == null || longitude == null) return null;
  return { latitude, longitude };
}

function toLatLngArray(coord) {
  const c = normCoord(coord);
  return c ? [c.latitude, c.longitude] : null;
}

export function buildLeafletTrackingHtml({ center, agent, destination, routeCoords }) {
  const centerCoord = normCoord(center) || normCoord(destination) || normCoord(agent) || { latitude: 20.5937, longitude: 78.9629 };
  const agentLatLng = toLatLngArray(agent);
  const destinationLatLng = toLatLngArray(destination);
  const route = Array.isArray(routeCoords)
    ? routeCoords
        .map((c) => toLatLngArray(c))
        .filter(Boolean)
    : [];

  const payload = JSON.stringify({
    center: [centerCoord.latitude, centerCoord.longitude],
    agent: agentLatLng,
    destination: destinationLatLng,
    route,
  });

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #f3f4f6; }
    .agent-pin {
      width: 28px; height: 28px; border-radius: 14px; background: #fff;
      border: 2px solid #6c2bd9; display: flex; align-items: center; justify-content: center;
      box-shadow: 0 1px 6px rgba(0,0,0,0.24); font-size: 16px; line-height: 1;
    }
    .dest-pin {
      width: 14px; height: 14px; border-radius: 7px; background: #6c2bd9;
      border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.25);
    }
    .leaflet-control-attribution { font-size: 9px; opacity: 0.75; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const data = ${payload};
    const map = L.map('map', {
      zoomControl: false,
      attributionControl: true,
      dragging: true,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: true,
      boxZoom: false,
      keyboard: false
    }).setView(data.center, 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

    const points = [];
    if (Array.isArray(data.route) && data.route.length >= 2) {
      L.polyline(data.route, { color: '#6c2bd9', weight: 5, opacity: 0.95 }).addTo(map);
      data.route.forEach((p) => points.push(p));
    }

    if (data.destination) {
      const destIcon = L.divIcon({ className: '', html: '<div class="dest-pin"></div>', iconSize: [14, 14], iconAnchor: [7, 7] });
      L.marker(data.destination, { icon: destIcon }).addTo(map);
      points.push(data.destination);
    }

    if (data.agent) {
      const agentIcon = L.divIcon({ className: '', html: '<div class="agent-pin">🚚</div>', iconSize: [28, 28], iconAnchor: [14, 14] });
      L.marker(data.agent, { icon: agentIcon }).addTo(map);
      points.push(data.agent);
      L.circle(data.agent, { radius: 45, color: '#6c2bd9', fillColor: '#6c2bd9', fillOpacity: 0.12, weight: 0 }).addTo(map);
    }

    if (points.length >= 2) {
      map.fitBounds(L.latLngBounds(points), { padding: [26, 26] });
    } else if (points.length === 1) {
      map.setView(points[0], 16);
    }
  </script>
</body>
</html>`;
}
