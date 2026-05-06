/** Downsample coordinate arrays so MapView/polyline stays smooth on low-end phones. */
export function thinCoordinates(coordinates, maxPoints = 500) {
  if (!coordinates?.length) return [];
  if (coordinates.length <= maxPoints) return coordinates;
  const step = Math.ceil(coordinates.length / maxPoints);
  const out = [];
  for (let i = 0; i < coordinates.length; i += step) {
    out.push(coordinates[i]);
  }
  const last = coordinates[coordinates.length - 1];
  const tail = out[out.length - 1];
  if (
    tail &&
    last &&
    (tail.latitude !== last.latitude || tail.longitude !== last.longitude)
  ) {
    out.push(last);
  }
  return out;
}

export function coordsForFit(markersAndRoute) {
  const flat = [];
  for (const item of markersAndRoute) {
    if (!item) continue;
    if (Array.isArray(item)) flat.push(...item.filter(Boolean));
    else flat.push(item);
  }
  return thinCoordinates(flat, 800);
}
