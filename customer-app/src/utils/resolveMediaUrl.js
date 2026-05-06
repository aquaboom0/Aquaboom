import { getAssetBaseUrlSync } from '../config/dynamicEndpoints';

/** Turn `/uploads/...` or bare paths into absolute URLs; leave http(s) URLs unchanged. */
export function resolveMediaUrl(url) {
  if (url == null || url === '') return '';
  const s = String(url).trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  const path = s.startsWith('/') ? s : `/${s}`;
  return `${getAssetBaseUrlSync()}${path}`;
}
