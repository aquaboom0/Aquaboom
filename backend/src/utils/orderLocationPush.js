/** Helpers for agent/admin FCM payloads with optional Static Maps preview. */

const MAX_BODY_CHARS = 220;

export function truncateForNotification(str, max = MAX_BODY_CHARS) {
  if (!str) return '';
  const s = str.trim();
  return s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1))}…`;
}

export function formatDeliveryAddressLine(order) {
  const a = order?.deliveryAddress;
  if (!a) return '';
  return [a.line1, a.line2, a.landmark, a.city, a.pincode].filter(Boolean).join(', ');
}

/**
 * Returns a Maps Static API URL showing the pin (HTTPS, suitable for FCM imageUrl).
 * Needs GOOGLE_STATIC_MAPS_API_KEY or GOOGLE_MAPS_API_KEY with Static Maps enabled.
 */
export function buildStaticMapImageUrl(lat, lng) {
  const key =
    process.env.GOOGLE_STATIC_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
  if (!key || lat == null || lng == null) return null;
  const la = Number(lat);
  const lo = Number(lng);
  if (Number.isNaN(la) || Number.isNaN(lo)) return null;

  const center = `${la},${lo}`;
  const marker = `color:0x0ea5e9|${la},${lo}`;
  const qs = [
    `center=${encodeURIComponent(center)}`,
    'zoom=16',
    'size=512x288',
    'scale=2',
    'maptype=roadmap',
    `markers=${encodeURIComponent(marker)}`,
    `key=${encodeURIComponent(key)}`,
  ].join('&');

  return `https://maps.googleapis.com/maps/api/staticmap?${qs}`;
}

export function getOrderLocationExtras(order) {
  const addressLine = formatDeliveryAddressLine(order);
  const lat = order?.deliveryAddress?.lat;
  const lng = order?.deliveryAddress?.lng;
  let mapImageUrl = null;
  if (lat != null && lng != null) {
    mapImageUrl = buildStaticMapImageUrl(lat, lng);
  }

  let coords = null;
  if (lat != null && lng != null) {
    const la = Number(lat);
    const lo = Number(lng);
    if (!Number.isNaN(la) && !Number.isNaN(lo)) {
      coords = { lat: la, lng: lo };
    }
  }

  return { addressLine, mapImageUrl, coords };
}

/** FCM data map (values must stringify to strings in firebase.js). */
export function buildAgentOrderDataExtras(order, notificationType) {
  const { addressLine, coords } = getOrderLocationExtras(order);
  const base = {
    orderId: order._id.toString(),
    orderIdDisplay: String(order.orderId),
    type: notificationType,
    address: addressLine,
  };
  if (coords) {
    base.lat = String(coords.lat);
    base.lng = String(coords.lng);
  }
  return base;
}
