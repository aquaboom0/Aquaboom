import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { authAPI } from './api';
import { store } from '../store';
import { navigationRef } from '../navigation/navigationRef';
import { showOrderActivityBanner } from '../store/slices/realtimeSlice';
import { accentForStatus } from '../utils/orderActivityAccent';

/** Must match backend `firebase.js` Android notification channelId for FCM display. */
export const ORDERS_CHANNEL_ID = 'aquaboom_orders';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

let pushListenerSub = null;

/**
 * When a push arrives in foreground, mirror the same Zepto-style banner as socket updates.
 */
export function attachOrderPushBridge() {
  if (pushListenerSub) return;
  pushListenerSub = Notifications.addNotificationReceivedListener((event) => {
    const content = event.request?.content;
    if (!content) return;
    const data = content.data || {};
    const authRole = store.getState().auth.user?.role || store.getState().auth.role;
    const staffTypes = ['new_order', 'order_pending_approval'];
    if (staffTypes.includes(String(data.type)) && (authRole === 'delivery_agent' || authRole === 'admin')) {
      return;
    }
    if (!data.orderId) return;
    store.dispatch(
      showOrderActivityBanner({
        title: content.title || 'Order update',
        subtitle: content.body || '',
        accent: accentForStatus(data.status || ''),
        orderId: data.orderId,
        orderRef: data.orderRef,
      })
    );
  });
}

async function ensureChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ORDERS_CHANNEL_ID, {
      name: 'Orders & deliveries',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      sound: 'default',
    });
  }
}

async function getFcmTokenOrNull() {
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    console.warn(
      '[FCM] Notifications permission not granted; token will not be registered.'
    );
    return null;
  }
  try {
    const tokenRes = await Notifications.getDevicePushTokenAsync();
    const fcmToken = tokenRes?.data;
    if (!fcmToken || typeof fcmToken !== 'string') {
      console.warn(
        '[FCM] No device push token — on Android ensure android/app/google-services.json exists (same Firebase project as the server service account).',
        tokenRes
      );
      return null;
    }
    return fcmToken;
  } catch (e) {
    console.warn(
      '[FCM] getDevicePushTokenAsync failed — check Firebase/Android setup:',
      e?.message || e
    );
    return null;
  }
}

/**
 * Registers for device push (FCM on Android) and sends the token to your API.
 * Call after admin or delivery_agent login so Firebase Admin can target this device.
 */
export async function ensurePushRegistrationForStaff(role) {
  try {
    if (!Device.isDevice) return;
    await ensureChannel();
    const fcmToken = await getFcmTokenOrNull();
    if (!fcmToken) return;

    if (role === 'admin') {
      await authAPI.updateAdminFcmToken(fcmToken);
    } else if (role === 'delivery_agent') {
      await authAPI.updateAgentFcmToken(fcmToken);
    }
  } catch (e) {
    console.warn('Push registration:', e?.message || e);
  }
}

/** Customer — receives milestone pushes (confirmed, rider, OFD, delivered). */
export async function ensurePushRegistrationForCustomer() {
  try {
    if (!Device.isDevice) return;
    await ensureChannel();
    const fcmToken = await getFcmTokenOrNull();
    if (!fcmToken) return;
    await authAPI.updateCustomerFcmToken(fcmToken);
  } catch (e) {
    console.warn('Customer push registration:', e?.message || e);
  }
}

/** Pending deep-link when tapping partner push before navigator/session is ready */
let pendingAgentOrderId = null;

export function consumePendingAgentOrderTap() {
  const id = pendingAgentOrderId;
  if (!id || !navigationRef.isReady()) return;
  const role = store.getState().auth.user?.role;
  if (role !== 'delivery_agent') return;
  try {
    navigationRef.navigate('AgentOrderDetail', { orderId: id });
    pendingAgentOrderId = null;
  } catch (_) {
    // keep pending for next retry
  }
}

function scheduleAgentOrderNavigateFromPush(orderId, attempt = 0) {
  if (!orderId) return;
  pendingAgentOrderId = orderId;
  const role = store.getState().auth.user?.role;
  if (role !== 'delivery_agent') {
    if (attempt < 80) setTimeout(() => scheduleAgentOrderNavigateFromPush(orderId, attempt + 1), 100);
    return;
  }
  if (!navigationRef.isReady()) {
    if (attempt < 80) setTimeout(() => scheduleAgentOrderNavigateFromPush(orderId, attempt + 1), 100);
    return;
  }
  try {
    navigationRef.navigate('AgentOrderDetail', { orderId });
    pendingAgentOrderId = null;
  } catch (_) {
    if (attempt < 80) setTimeout(() => scheduleAgentOrderNavigateFromPush(orderId, attempt + 1), 100);
  }
}

function handlePartnerNotificationTapResponse(response) {
  const data = response?.notification?.request?.content?.data || {};
  if (!data.orderId) return;
  if (!['new_order', 'order_pending_approval'].includes(String(data.type))) return;
  scheduleAgentOrderNavigateFromPush(data.orderId);
}

/** Call once at app bootstrap; returns cleanup unsubscriber */
export function attachAgentNotificationTapRouter() {
  Notifications.getLastNotificationResponseAsync().then((res) => {
    if (res) handlePartnerNotificationTapResponse(res);
  });
  const sub = Notifications.addNotificationResponseReceivedListener(handlePartnerNotificationTapResponse);
  return () => sub.remove();
}
