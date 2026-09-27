export interface GeocodeResult {
  name: string;
  lat: number;
  lng: number;
}

/** Real location search via OpenStreetMap Nominatim. */
export async function searchPlace(query: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
  if (!query.trim()) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (res.status === 429) {
    throw new Error("Search is rate-limited right now — wait a second and try again.");
  }
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const data = await res.json();
  return data.map((d: any) => ({
    name: d.display_name,
    lat: parseFloat(d.lat),
    lng: parseFloat(d.lon),
  }));
}

/**
 * Best-effort reverse geocode: turns a clicked lat/lng into a short, real
 * place name via Nominatim. Returns null (never throws) on any failure —
 * remote points (mountain passes, off-trail spots) often have nothing
 * nearby, and callers should just fall back to a generic "Point N" name.
 */
export async function reverseGeocode(lat: number, lng: number, signal?: AbortSignal): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`;
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address ?? {};
    const short: string | undefined =
      addr.hamlet ||
      addr.village ||
      addr.town ||
      addr.suburb ||
      addr.neighbourhood ||
      addr.city ||
      addr.county ||
      addr.state_district ||
      data.name ||
      (typeof data.display_name === 'string' ? data.display_name.split(',')[0] : undefined);
    return short?.trim() || null;
  } catch {
    return null;
  }
}
