import { decodeGooglePolyline } from '../utils/polyline.js';
import { logger } from '../config/logger.js';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * @returns {Promise<{ ok: true, coordinates: {latitude:number, longitude:number}[], distanceMeters?: number, durationSeconds?: number } | { ok: false, message: string }>}
 */
export async function getDrivingRoute(originLat, originLng, destLat, destLng) {
  const olat = num(originLat);
  const olng = num(originLng);
  const dlat = num(destLat);
  const dlng = num(destLng);
  if ([olat, olng, dlat, dlng].some((x) => x == null)) {
    return { ok: false, message: 'Invalid coordinates.' };
  }
  if (Math.abs(olat) > 90 || Math.abs(dlat) > 90 || Math.abs(olng) > 180 || Math.abs(dlng) > 180) {
    return { ok: false, message: 'Coordinates out of range.' };
  }

  const key =
    process.env.GOOGLE_DIRECTIONS_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim();

  if (!key) {
    return { ok: false, message: 'Server missing GOOGLE_MAPS_API_KEY for directions.' };
  }

  const qs = new URLSearchParams({
    origin: `${olat},${olng}`,
    destination: `${dlat},${dlng}`,
    mode: 'driving',
    key,
  });

  const url = `https://maps.googleapis.com/maps/api/directions/json?${qs}`;

  try {
    const res = await fetch(url, { method: 'GET' });
    const data = await res.json();

    if (data.status !== 'OK' || !data.routes?.[0]) {
      logger.warn(`Directions API: ${data.status} — ${data.error_message || ''}`);
      return {
        ok: false,
        message:
          data.status === 'REQUEST_DENIED'
            ? 'Directions API denied key or billing. Enable Directions API in Google Cloud.'
            : `No route (${data.status || 'unknown'}).`,
      };
    }

    const route = data.routes[0];
    const leg = route.legs?.[0];
    const encoded = route.overview_polyline?.points;
    const coordinates = encoded ? decodeGooglePolyline(encoded) : [];

    return {
      ok: true,
      coordinates,
      distanceMeters: leg?.distance?.value,
      durationSeconds: leg?.duration?.value,
    };
  } catch (e) {
    logger.error(`Directions fetch error: ${e.message}`);
    return { ok: false, message: 'Failed to fetch directions.' };
  }
}
