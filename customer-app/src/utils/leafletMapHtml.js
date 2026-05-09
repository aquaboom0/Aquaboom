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

/**
 * Offline-capable-ish inline HTML for WebView Leaflet tracking.
 * - Dual CDN load for Leaflet (jsDelivr → unpkg).
 * - OSM tiles with Carto light fallback after tile failures.
 * - Exposes window.__invalidate / window.__fitTracking for RN injection.
 */
export function buildLeafletTrackingHtml({ center, agent, destination, routeCoords }) {
  const centerCoord =
    normCoord(center) ||
    normCoord(destination) ||
    normCoord(agent) || { latitude: 20.5937, longitude: 78.9629 };
  const agentLatLng = toLatLngArray(agent);
  const destinationLatLng = toLatLngArray(destination);
  const route = Array.isArray(routeCoords)
    ? routeCoords.map((c) => toLatLngArray(c)).filter(Boolean)
    : [];

  const payload = {
    center: [centerCoord.latitude, centerCoord.longitude],
    agent: agentLatLng,
    destination: destinationLatLng,
    route,
  };

  const payloadJsonEsc = JSON.stringify(payload).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"/>
  <style>
    *,*::before,*::after { box-sizing: border-box; }
    html, body { margin: 0; height: 100%; width: 100%; overflow: hidden; background: #e8eaf0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; touch-action: manipulation; }
    #map { width: 100%; height: 100%; background: linear-gradient(180deg, #e0e7ef 0%, #eef1f7 50%, #dfe6ee 100%); }
    #boot-wrap { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 5000;
      background: rgba(232,236,240,0.92); pointer-events: none; }
    #boot-wrap.ready { opacity: 0; transition: opacity 0.25s ease; pointer-events: none; }
    .boot-txt { color: #475569; font-size: 14px; font-weight: 600; }
    .leaflet-control-attribution { font-size: 9px !important; max-width: 75%; opacity: 0.75; white-space: normal; line-height: 1.25; }
    .agent-pin {
      width: 30px; height: 30px; border-radius: 15px; background: linear-gradient(180deg, #fafafa, #eef2ff);
      border: 2.5px solid #6c2bd9; display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 10px rgba(30,58,138,0.28); font-size: 15px;
    }
    .dest-pin {
      width: 16px; height: 16px; border-radius: 50%; background: radial-gradient(circle at 30% 30%, #8b5cf6, #4c1d95);
      border: 2.5px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.22);
    }
    .leaflet-div-icon.mark-wrap {
      border: none !important; background: transparent !important; margin: 0 !important;
    }
  </style>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css"/>
</head>
<body>
  <div id="boot-wrap"><span class="boot-txt">Preparing AquaBoom map…</span></div>
  <div id="map" role="application" aria-label="Delivery tracking map"></div>
  <script type="application/json" id="__td">${payloadJsonEsc}</script>
  <script>
(function () {
  function post(kind, payload) {
    try {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({ type: kind }, payload || {})));
      }
    } catch (e2) {}
  }

  var DATA = (function(){
    try { return JSON.parse(document.getElementById('__td').textContent || '{}'); } catch (_e3) {
      post('map_boot_error', { reason: 'parse' });
      return { center:[20.5937,78.9629], agent:null, destination:null, route:[] };
    }
  })();

  var LEAF_S = [
    'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
  ];

  function loadScript(i, done) {
    if (typeof L !== 'undefined' && L.map) return done(true);
    if (i >= LEAF_S.length) {
      post('map_boot_error', { reason: 'leaflet_scripts' });
      document.getElementById('boot-wrap').innerHTML = '<span class="boot-txt">Map libraries blocked. Tap refresh in the app.</span>';
      return done(false);
    }
    var s = document.createElement('script');
    s.async = false;
    s.src = LEAF_S[i];
    s.onload = function () { typeof L !== 'undefined' ? done(true) : loadScript(i + 1, done); };
    s.onerror = function () { loadScript(i + 1, done); };
    document.head.appendChild(s);
  }

  loadScript(0, function (ok) {
    if (!ok) return;
    try {
      runMap(DATA);
    } catch (e4) {
      post('map_boot_error', { reason: 'runtime', message: (e4 && e4.message) ? String(e4.message) : '' });
    }
  });

  function runMap(data) {
    var boots = document.getElementById('boot-wrap');

    var map = L.map('map', {
      zoomControl: true,
      zoomControlOptions: { position: 'bottomright' },
      attributionControl: true,
      dragging: true,
      scrollWheelZoom: false,
      doubleClickZoom: true,
      touchZoom: true,
      tap: true,
      boxZoom: false,
      keyboard: false,
      preferCanvas: false
    }).setView(data.center, 14);

    window.__map = map;
    window.__trackingPoints = [];

    var osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
    });

    var carto = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
      subdomains: 'abcd',
      maxZoom: 20,
      attribution: '&copy; <a href="https://carto.com/">CARTO</a> · &copy; OSM'
    });

    var osmFails = 0;
    osm.on('tileerror', function () {
      osmFails += 1;
      if (osmFails >= 6 && map.hasLayer(osm)) {
        map.removeLayer(osm);
        carto.addTo(map);
      }
    });

    osm.addTo(map);

    var points = [];

    function buildRoutePolyline() {
      if (map.__routeLayer) {
        map.removeLayer(map.__routeLayer);
        map.__routeLayer = null;
      }
      if (Array.isArray(data.route) && data.route.length >= 2) {
        map.__routeLayer = L.polyline(data.route, { color: '#5b21b6', weight: 5, opacity: 0.9, smoothFactor: 1.05 }).addTo(map);
        data.route.forEach(function (p) { points.push(p); });
      }
    }

    buildRoutePolyline();

    if (map.__destMarker) map.removeLayer(map.__destMarker);
    if (data.destination) {
      var destIcon = L.divIcon({
        html: '<div class="dest-pin"></div>',
        className: 'mark-wrap',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });
      map.__destMarker = L.marker(data.destination, { icon: destIcon }).addTo(map).bindTooltip('Your drop-off');
      points.push(data.destination);
    }

    if (map.__agentMarker) map.removeLayer(map.__agentMarker);
    if (map.__agentGlow) map.removeLayer(map.__agentGlow);

    if (data.agent) {
      var glow = L.circle(data.agent, {
        radius: 55,
        stroke: false,
        fillColor: '#6c2bd9',
        fillOpacity: 0.09
      }).addTo(map);
      map.__agentGlow = glow;

      var agIcon = L.divIcon({
        html: '<div class="agent-pin" aria-hidden="true">🚚</div>',
        className: 'mark-wrap',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });
      map.__agentMarker = L.marker(data.agent, { icon: agIcon }).addTo(map).bindTooltip('Rider');

      points.push(data.agent);
    }

    window.__trackingPoints = points.slice();

    function fit() {
      var pts = window.__trackingPoints || [];
      if (pts.length >= 2) {
        try {
          map.fitBounds(L.latLngBounds(pts), { padding: [36, 36], animate: false, maxZoom: 16 });
          return;
        } catch (_) {}
      }
      if (pts.length === 1) {
        map.setView(pts[0], 16, { animate: false });
        return;
      }
      map.setView(data.center, 14, { animate: false });
    }

    window.__fitTracking = fit;
    window.__invalidate = function () {
      map.invalidateSize({ animate: false });
      fit();
    };

    fit();

    [80, 220, 500, 1000].forEach(function (ms) {
      setTimeout(function () {
        map.invalidateSize({ animate: false });
        fit();
      }, ms);
    });

    if (boots) boots.classList.add('ready');

    window.addEventListener('resize', function () {
      window.__invalidate();
    });

    post('map_ready', { points: points.length });

    /** When RN sends refreshed payload without full reload — optional bridge */
    window.__aquaboom_refresh = window.__invalidate;
  }
})();
  </script>
</body>
</html>`;
}
