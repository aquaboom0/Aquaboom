import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL as DEFAULT_API, ASSET_BASE_URL as DEFAULT_ASSET } from './index';

const STORAGE_KEY = 'aquaboom_endpoint_override_v1';

/** @type {{ apiBaseUrl: string, assetBaseUrl: string } | null} */
let cache = null;

export async function hydrateEndpointOverride() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cache = null;
      return;
    }
    const parsed = JSON.parse(raw);
    if (parsed?.apiBaseUrl && parsed?.assetBaseUrl) {
      cache = parsed;
    } else {
      cache = null;
    }
  } catch {
    cache = null;
  }
}

export function getApiBaseUrlSync() {
  if (cache?.apiBaseUrl) return cache.apiBaseUrl;
  return DEFAULT_API;
}

export function getAssetBaseUrlSync() {
  if (cache?.assetBaseUrl) return cache.assetBaseUrl;
  return DEFAULT_ASSET;
}

export function getSocketUrlSync() {
  return getAssetBaseUrlSync();
}

/** @returns {{ host: string, port: string, protocol: string } | null} */
export function parseHostPortFromOverride() {
  if (!cache?.assetBaseUrl) return null;
  try {
    const u = new URL(cache.assetBaseUrl);
    const port = u.port ? String(u.port) : u.protocol === 'https:' ? '443' : '5001';
    return { host: u.hostname, port, protocol: u.protocol.replace(':', '') };
  } catch {
    return null;
  }
}

export async function persistEndpointOverride(host, port, protocol = '') {
  const rawHost = String(host || '').trim();
  if (!rawHost) {
    await clearEndpointOverride();
    return;
  }
  let resolvedProtocol = String(protocol || '').trim().toLowerCase();
  let resolvedHost = rawHost;
  if (/^https?:\/\//i.test(rawHost)) {
    const parsed = new URL(rawHost);
    resolvedHost = parsed.hostname;
    if (!resolvedProtocol) resolvedProtocol = parsed.protocol.replace(':', '');
    if (!port && parsed.port) port = parsed.port;
  }
  if (!resolvedProtocol) {
    resolvedProtocol = /\.onrender\.com$/i.test(resolvedHost) ? 'https' : 'http';
  }
  const p = Number(String(port).trim()) || (resolvedProtocol === 'https' ? 443 : 5001);
  const needsExplicitPort = !(
    (resolvedProtocol === 'https' && p === 443) ||
    (resolvedProtocol === 'http' && p === 80)
  );
  const hostPort = needsExplicitPort ? `${resolvedHost}:${p}` : resolvedHost;
  const asset = `${resolvedProtocol}://${hostPort}`;
  const next = { apiBaseUrl: `${asset}/api`, assetBaseUrl: asset };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  cache = next;
}

export async function clearEndpointOverride() {
  await AsyncStorage.removeItem(STORAGE_KEY);
  cache = null;
}
