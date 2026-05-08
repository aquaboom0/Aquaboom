import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL as DEFAULT_API, ASSET_BASE_URL as DEFAULT_ASSET } from './index';

const STORAGE_KEY = 'aquaboom_endpoint_override_v1';

/** @type {{ apiBaseUrl: string, assetBaseUrl: string } | null} */
let cache = null;

function stripSpaces(v) {
  return String(v || '').trim().replace(/\s+/g, '');
}

/** Origin string including non-default ports (fixes LAN http://192.168.x.x:5001). */
function originFromParsedUrl(u) {
  // u is URL — port is omitted in string when default for scheme
  if (u.port) return `${u.protocol}//${u.hostname}:${u.port}`;
  return `${u.protocol}//${u.hostname}`;
}

/**
 * Accept full URLs, origins, or bare host[:port][/path].
 * Bare render.com hosts use https; other bare hosts default to http (LAN).
 */
function parseFlexibleUrl(raw) {
  const s = stripSpaces(raw);
  if (!s) return null;
  try {
    if (/^https?:\/\//i.test(s)) return new URL(s);
    const hostOnly = s.split('/')[0];
    const scheme = /\.onrender\.com$/i.test(hostOnly) ? 'https' : 'http';
    return new URL(`${scheme}://${s.replace(/^\/+/, '')}`);
  } catch {
    return null;
  }
}

export function normalizeAssetBaseUrl(v) {
  const u = parseFlexibleUrl(v);
  if (!u) return '';
  return originFromParsedUrl(u);
}

export function normalizeApiBaseUrl(v) {
  const u = parseFlexibleUrl(v);
  if (!u) return '';
  return `${originFromParsedUrl(u)}/api`;
}

export async function hydrateEndpointOverride() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cache = null;
      return;
    }
    const parsed = JSON.parse(raw);
    let apiBaseUrl = normalizeApiBaseUrl(parsed?.apiBaseUrl);
    let assetBaseUrl = normalizeAssetBaseUrl(parsed?.assetBaseUrl);
    if (apiBaseUrl && !assetBaseUrl) {
      const fromApi = apiBaseUrl.replace(/\/api\/?$/i, '');
      assetBaseUrl = normalizeAssetBaseUrl(fromApi);
    }
    if (assetBaseUrl && !apiBaseUrl) {
      apiBaseUrl = `${assetBaseUrl}/api`;
    }
    if (apiBaseUrl && assetBaseUrl) {
      cache = { apiBaseUrl, assetBaseUrl };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    } else {
      cache = null;
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    cache = null;
  }
}

export function getApiBaseUrlSync() {
  if (cache?.apiBaseUrl) return normalizeApiBaseUrl(cache.apiBaseUrl) || DEFAULT_API;
  return DEFAULT_API;
}

export function getAssetBaseUrlSync() {
  if (cache?.assetBaseUrl) return normalizeAssetBaseUrl(cache.assetBaseUrl) || DEFAULT_ASSET;
  return DEFAULT_ASSET;
}

export function getSocketUrlSync() {
  return getAssetBaseUrlSync();
}

/** @returns {{ host: string, port: string, protocol: string } | null} */
export function parseHostPortFromOverride() {
  if (!cache?.assetBaseUrl) return null;
  try {
    const u = parseFlexibleUrl(cache.assetBaseUrl);
    if (!u) return null;
    const port = u.port ? String(u.port) : u.protocol === 'https:' ? '443' : '5001';
    return { host: u.hostname, port, protocol: u.protocol.replace(':', '') };
  } catch {
    return null;
  }
}

export async function persistEndpointOverride(host, port, protocol = '') {
  const rawHost = stripSpaces(host);
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
  const next = {
    apiBaseUrl: normalizeApiBaseUrl(`${asset}/api`),
    assetBaseUrl: normalizeAssetBaseUrl(asset),
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  cache = next;
}

export async function clearEndpointOverride() {
  await AsyncStorage.removeItem(STORAGE_KEY);
  cache = null;
}
