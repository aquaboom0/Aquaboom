/**
 * Bakes `expo.extra` into native builds so `Constants.expoConfig.extra` works in release APKs.
 * Preferred for production: expo.extra.apiBaseUrl (e.g. https://aquaboom.onrender.com).
 * LAN fallback: http://{apiLanHost}:{apiPort} — set in app.json → expo.extra, then rebuild native app.
 */
const fs = require('fs');
const path = require('path');

const appJson = require('./app.json');

const DEFAULT_API_LAN_HOST = '192.168.1.3';
const DEFAULT_API_PORT = 5001;

const fromJson = appJson.expo.extra || {};

/** Auto-fill Firebase keys from sibling google-services.json (Android) when builds have that file locally. */
function firebaseExtraFromGoogleServices() {
  const p = path.join(__dirname, 'google-services.json');
  try {
    if (!fs.existsSync(p)) return {};
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const pi = raw.project_info || {};
    const client = Array.isArray(raw.client) ? raw.client[0] : null;
    const keyEntry = Array.isArray(client?.api_key) ? client.api_key[0] : null;
    const apiKey = keyEntry?.current_key != null ? String(keyEntry.current_key).trim() : '';
    const appId =
      client?.client_info?.mobilesdk_app_id != null
        ? String(client.client_info.mobilesdk_app_id).trim()
        : '';
    const projectId = pi.project_id != null ? String(pi.project_id).trim() : '';
    return {
      firebaseApiKey: apiKey,
      firebaseProjectId: projectId,
      firebaseStorageBucket:
        pi.storage_bucket != null ? String(pi.storage_bucket).trim() : '',
      firebaseMessagingSenderId:
        pi.project_number != null ? String(pi.project_number).trim() : '',
      firebaseAppId: appId,
      firebaseAuthDomain: projectId ? `${projectId}.firebaseapp.com` : '',
    };
  } catch {
    return {};
  }
}

const fromGoogleServices = firebaseExtraFromGoogleServices();

/** Prefer explicit app.json/extra.rtdb URL; omit trailing slash */
function normalizeDbUrl(url) {
  if (typeof url !== 'string') return '';
  return url.trim().replace(/\/+$/, '');
}

function strip(s) {
  if (s == null) return '';
  const t = String(s).trim();
  return t;
}

module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      ...fromJson,
      apiBaseUrl:
        (fromJson.apiBaseUrl != null && String(fromJson.apiBaseUrl).trim()) ||
        'https://aquaboom.onrender.com',
      apiPort: Number(fromJson.apiPort) || DEFAULT_API_PORT,
      apiLanHost:
        (fromJson.apiLanHost != null && String(fromJson.apiLanHost).trim()) ||
        DEFAULT_API_LAN_HOST,
      useLanForAndroid:
        typeof fromJson.useLanForAndroid === 'boolean' ? fromJson.useLanForAndroid : true,
      firebaseApiKey:
        strip(process.env.EXPO_PUBLIC_FIREBASE_API_KEY) ||
        strip(fromJson.firebaseApiKey) ||
        fromGoogleServices.firebaseApiKey ||
        '',
      firebaseAuthDomain:
        strip(process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN) ||
        strip(fromJson.firebaseAuthDomain) ||
        fromGoogleServices.firebaseAuthDomain ||
        '',
      firebaseDatabaseURL: normalizeDbUrl(
        strip(process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL) ||
          strip(fromJson.firebaseDatabaseURL) ||
          ''
      ),
      firebaseProjectId:
        strip(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID) ||
        strip(fromJson.firebaseProjectId) ||
        fromGoogleServices.firebaseProjectId ||
        '',
      firebaseStorageBucket:
        strip(process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET) ||
        strip(fromJson.firebaseStorageBucket) ||
        fromGoogleServices.firebaseStorageBucket ||
        '',
      firebaseMessagingSenderId:
        strip(process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID) ||
        strip(fromJson.firebaseMessagingSenderId) ||
        fromGoogleServices.firebaseMessagingSenderId ||
        '',
      firebaseAppId:
        strip(process.env.EXPO_PUBLIC_FIREBASE_APP_ID) ||
        strip(fromJson.firebaseAppId) ||
        fromGoogleServices.firebaseAppId ||
        '',
    },
  },
};
