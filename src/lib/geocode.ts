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
