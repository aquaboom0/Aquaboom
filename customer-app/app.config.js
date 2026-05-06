/**
 * Bakes `expo.extra` into native builds so `Constants.expoConfig.extra` works in release APKs.
 * API base: http://{apiLanHost}:{apiPort} — set in app.json → expo.extra, then rebuild native app.
 * Backend CORS: backend/.env CLIENT_URL should list the same LAN IP with Metro port :8081 (comma-separated).
 */
const appJson = require('./app.json');

const DEFAULT_API_LAN_HOST = '192.168.1.3';
const DEFAULT_API_PORT = 5001;

const fromJson = appJson.expo.extra || {};

module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      ...fromJson,
      apiPort: Number(fromJson.apiPort) || DEFAULT_API_PORT,
      apiLanHost:
        (fromJson.apiLanHost != null && String(fromJson.apiLanHost).trim()) ||
        DEFAULT_API_LAN_HOST,
      useLanForAndroid:
        typeof fromJson.useLanForAndroid === 'boolean' ? fromJson.useLanForAndroid : true,
    },
  },
};
