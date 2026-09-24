export interface ParsedGpx {
  trackPoints: [number, number][]; // [lng, lat]
  waypoints: { name: string; lat: number; lng: number; ele?: number }[];
}

/**
 * Parse a GPX file's real GPS track (<trkpt>) and named waypoints (<wpt>).
 * The track points ARE the actual recorded geometry — used as-is, never
 * simplified into a straight line between endpoints.
 */
export function parseGpx(xmlText: string): ParsedGpx {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const err = doc.querySelector('parsererror');
  if (err) throw new Error('Could not parse GPX file (invalid XML).');

  const trackPoints: [number, number][] = [];
  doc.querySelectorAll('trkpt').forEach((el) => {
    const lat = parseFloat(el.getAttribute('lat') || '');
    const lon = parseFloat(el.getAttribute('lon') || '');
    if (!isNaN(lat) && !isNaN(lon)) trackPoints.push([lon, lat]);
  });

  // Some GPX files store the track under <rtept> instead.
  if (trackPoints.length === 0) {
    doc.querySelectorAll('rtept').forEach((el) => {
      const lat = parseFloat(el.getAttribute('lat') || '');
      const lon = parseFloat(el.getAttribute('lon') || '');
      if (!isNaN(lat) && !isNaN(lon)) trackPoints.push([lon, lat]);
    });
  }

  const waypoints: ParsedGpx['waypoints'] = [];
  doc.querySelectorAll('wpt').forEach((el) => {
    const lat = parseFloat(el.getAttribute('lat') || '');
    const lon = parseFloat(el.getAttribute('lon') || '');
    const nameEl = el.querySelector('name');
    const eleEl = el.querySelector('ele');
    if (!isNaN(lat) && !isNaN(lon)) {
      waypoints.push({
        name: nameEl?.textContent?.trim() || 'Waypoint',
        lat,
        lng: lon,
        ele: eleEl?.textContent ? parseFloat(eleEl.textContent) : undefined,
      });
    }
  });

  if (trackPoints.length === 0 && waypoints.length === 0) {
    throw new Error('No track points or waypoints found in this GPX file.');
  }

  return { trackPoints, waypoints };
}
