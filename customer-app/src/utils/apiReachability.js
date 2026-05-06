import { getApiBaseUrlSync } from '../config/dynamicEndpoints';

/**
 * User-facing explanation when axios has no HTTP response (offline, wrong IP, firewall, VPN, etc.).
 * Returns null if the error looks like an application-level HTTP error (caller should use response body).
 */
export function explainApiFailure(error) {
  if (!error || error.response) return null;

  const msg = String(error.message || '');
  const code = error.code;
  const apiBase = getApiBaseUrlSync();

  if (code === 'ECONNABORTED' || /timeout/i.test(msg)) {
    return `Request timed out reaching ${apiBase}.\n\nCheck Wi‑Fi, that the backend is running, and the correct API address. Tap "API" on the admin bar to set your computer's LAN IP without rebuilding.`;
  }

  if (msg === 'Network Error' || code === 'ERR_NETWORK') {
    return `Cannot reach server at ${apiBase}.\n\n• Same Wi‑Fi for phone and PC (try turning off mobile data / VPN)\n• Backend: cd backend && npm start\n• Mac firewall: allow Node for incoming connections\n• Tap "API" next to Logout and enter this computer's IPv4 (e.g. 192.168.1.x) + port 5001 — no APK rebuild needed`;
  }

  return null;
}

/** For Alert titles / combined with server messages. */
export function formatApiErrorForAlert(error, fallback = 'Something went wrong') {
  const reach = explainApiFailure(error);
  if (reach) return reach;
  const server = error?.response?.data?.message || error?.response?.data?.error;
  if (server && typeof server === 'string') return server;
  if (error?.message && typeof error.message === 'string') return error.message;
  return fallback;
}
