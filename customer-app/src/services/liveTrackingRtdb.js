import { getDatabase, onValue, ref } from 'firebase/database';
import { getFirebaseApp } from '../config/firebaseClient';

/**
 * Listen for backend-synced rider position at `liveTracking/{orderMongoId}`.
 * @returns {() => void} unsubscribe
 */
export function subscribeOrderLiveTracking(orderId, onLocation) {
  const id = orderId != null ? String(orderId) : '';
  if (!id) return () => {};

  const app = getFirebaseApp();
  if (!app) return () => {};

  try {
    const db = getDatabase(app);
    const routeRef = ref(db, `liveTracking/${id}`);
    return onValue(routeRef, (snap) => {
      const v = snap.val();
      if (!v || v.lat == null || v.lng == null) return;
      const lat = Number(v.lat);
      const lng = Number(v.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      onLocation({ lat, lng, updatedAt: v.updatedAt });
    });
  } catch {
    return () => {};
  }
}
