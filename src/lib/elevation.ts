/** Real elevation lookup via the Open-Elevation public API. */
export async function fetchElevations(
  points: { lat: number; lng: number }[]
): Promise<number[]> {
  if (points.length === 0) return [];
  const locations = points.map((p) => `${p.lat},${p.lng}`).join('|');
  const url = `https://api.open-elevation.com/api/v1/lookup?locations=${locations}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Open-Elevation HTTP ${res.status}`);
    const data = await res.json();
    return data.results.map((r: any) => r.elevation as number);
  } catch {
    // Elevation is a nice-to-have; fail soft so the user can enter it manually.
    return points.map(() => NaN);
  }
}
