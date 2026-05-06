/**
 * Bakes `expo.extra` into native builds so `Constants.expoConfig.extra` works in release APKs.
 * Preferred for production: expo.extra.apiBaseUrl (e.g. https://aquaboom.onrender.com).
 * LAN fallback: http://{apiLanHost}:{apiPort} — set in app.json → expo.extra, then rebuild native app.
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
      apiBaseUrl:
        (fromJson.apiBaseUrl != null && String(fromJson.apiBaseUrl).trim()) ||
        'https://aquaboom.onrender.com',
      apiPort: Number(fromJson.apiPort) || DEFAULT_API_PORT,
      apiLanHost:
        (fromJson.apiLanHost != null && String(fromJson.apiLanHost).trim()) ||
        DEFAULT_API_LAN_HOST,
      useLanForAndroid:
        typeof fromJson.useLanForAndroid === 'boolean' ? fromJson.useLanForAndroid : true,
    },
  },
};
