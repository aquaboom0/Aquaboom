import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';

/** Must match LAN IP where the backend runs (`app.config.js` / `app.json` → expo.extra.apiLanHost). */
const DEFAULT_LAN_HOST = '192.168.1.3';
const DEFAULT_API_PORT = 5001;
const DEFAULT_CLOUD_API_BASE_URL = 'https://aquaboom.onrender.com';

// Backend port — must match backend `.env` PORT (e.g. 5001)
const extra = Constants.expoConfig?.extra ?? {};
const BACKEND_PORT = Number(extra.apiPort) || DEFAULT_API_PORT;
const cloudApiBaseUrl =
  typeof extra.apiBaseUrl === 'string' && extra.apiBaseUrl.trim()
    ? extra.apiBaseUrl.trim().replace(/\/+$/, '')
    : '';

/**
 * Physical device on Wi‑Fi: uses `apiLanHost` from native `expo.extra` (see app.config.js).
 */
const trimmedLan =
  extra.apiLanHost != null && String(extra.apiLanHost).trim()
    ? String(extra.apiLanHost).trim()
    : '';
export const LAN_HOST = trimmedLan || DEFAULT_LAN_HOST;

/** Android emulator: use 10.0.2.2. Real device: LAN_HOST when true. */
export const USE_LAN_FOR_ANDROID =
  typeof extra.useLanForAndroid === 'boolean' ? extra.useLanForAndroid : true;

/**
 * Optional: expo.extra.apiHost — bare hostname/IP only (no port), wins over defaults.
 */
function getApiHost() {
  if (extra.apiHost && typeof extra.apiHost === 'string' && extra.apiHost.trim()) {
    return extra.apiHost.trim();
  }

  if (Platform.OS === 'android') {
    if (!Device.isDevice) {
      return '10.0.2.2';
    }
    return USE_LAN_FOR_ANDROID ? LAN_HOST : '10.0.2.2';
  }

  if (Platform.OS === 'ios') {
    return Device.isDevice ? LAN_HOST : '127.0.0.1';
  }

  return LAN_HOST;
}

const host = getApiHost();

// API Configuration — resolved at runtime for emulator vs physical device
export const ASSET_BASE_URL =
  cloudApiBaseUrl || DEFAULT_CLOUD_API_BASE_URL || `http://${host}:${BACKEND_PORT}`;
export const API_BASE_URL = `${ASSET_BASE_URL}/api`;
export const SOCKET_URL = ASSET_BASE_URL;

// Razorpay Configuration
export const RAZORPAY_KEY_ID = 'your_razorpay_key_id';

// App Constants
export const FREE_DELIVERY_THRESHOLD = 299;
export const DELIVERY_CHARGE = 30;

// Order Status Mapping
export const ORDER_STATUS = {
  PLACED: 'Order Placed',
  PENDING_APPROVAL: 'Awaiting confirmation',
  AUTO_APPROVED: 'Confirmed',
  ASSIGNED: 'Partner Assigned',
  PICKED_UP: 'Picked Up',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  FAILED: 'Failed',
};

// Payment Methods
export const PAYMENT_METHODS = {
  COD: 'Cash on Delivery',
  ONLINE: 'Online Payment',
};

/**
 * Zepto-inspired retail palette: crisp neutrals, violet brand, readable contrast.
 */
export const COLORS = {
  primary: '#6d28d9',
  primaryDark: '#5b21b6',
  primaryLight: '#8b5cf6',
  secondary: '#059669',
  danger: '#dc2626',
  error: '#dc2626',
  warning: '#d97706',
  background: '#f4f4f7',
  surface: '#ffffff',
  /** Subtle cards / chips */
  surfaceMuted: '#f9fafb',
  text: '#111827',
  textSecondary: '#374151',
  textLight: '#6b7280',
  textMuted: '#9ca3af',
  /** Inputs — avoids “invisible” placeholders on light gray fields */
  placeholder: '#9ca3af',
  border: '#e5e7eb',
  borderStrong: '#d1d5db',
  success: '#059669',
};

/** Shared spacing — keeps screens aligned (Zepto-like airy layout). */
export const SPACE = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  xxl: 28,
};

export const RADII = {
  sm: 10,
  md: 14,
  lg: 18,
  pill: 999,
};
