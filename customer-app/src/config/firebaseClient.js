import Constants from 'expo-constants';
import { getApps, initializeApp } from 'firebase/app';

let cachedApp;

/**
 * Minimal Firebase JS app for Realtime Database (live rider position).
 * Set `extra` keys in app.json or EXPO_PUBLIC_* env at native build time.
 */
export function getFirebaseApp() {
  const existing = getApps()[0];
  if (existing) return existing;
  if (cachedApp) return cachedApp;

  const extra = Constants.expoConfig?.extra ?? {};
  const projectId =
    typeof extra.firebaseProjectId === 'string' && extra.firebaseProjectId.trim()
      ? extra.firebaseProjectId.trim()
      : 'aquaboom-3bdc0';
  const apiKey = typeof extra.firebaseApiKey === 'string' ? extra.firebaseApiKey.trim() : '';
  const databaseURL =
    typeof extra.firebaseDatabaseURL === 'string' ? extra.firebaseDatabaseURL.trim() : '';
  const authDomain =
    typeof extra.firebaseAuthDomain === 'string' && extra.firebaseAuthDomain.trim()
      ? extra.firebaseAuthDomain.trim()
      : `${projectId}.firebaseapp.com`;

  if (!apiKey || !databaseURL) return null;

  cachedApp = initializeApp({
    apiKey,
    authDomain,
    databaseURL,
    projectId,
    storageBucket:
      typeof extra.firebaseStorageBucket === 'string' && extra.firebaseStorageBucket.trim()
        ? extra.firebaseStorageBucket.trim()
        : `${projectId}.appspot.com`,
    messagingSenderId:
      typeof extra.firebaseMessagingSenderId === 'string'
        ? extra.firebaseMessagingSenderId.trim()
        : '',
    appId: typeof extra.firebaseAppId === 'string' ? extra.firebaseAppId.trim() : '',
  });

  return cachedApp;
}
