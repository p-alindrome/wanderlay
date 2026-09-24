import { haversineKm, pathDistanceKm } from './geo';

export interface RouteResult {
  coordinates: [number, number][];
  distanceKm: number;
  uncertain: boolean;
  reason?: string;
}

const OSRM_BASE = 'https://router.project-osrm.org';

/**
 * Ask a real routing engine (OSRM, driving profile, OSM road data) for the
 * road geometry between two points. If the engine can't find a road route
 * (common for high-altitude jeep tracks / unpaved mountain passes that
 * aren't in OSM as "driveable" ways), we do NOT silently draw a straight
 * line and call it a route — we return it flagged `uncertain: true` so the
 * UI can visibly warn the user and suggest importing a GPX track instead.
 */
export async function fetchRoadRoute(
  from: [number, number],
  to: [number, number],
  signal?: AbortSignal
): Promise<RouteResult> {
  const straightKm = haversineKm(from, to);
  const url = `${OSRM_BASE}/route/v1/driving/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.length) {
      throw new Error(data.message || 'No route found');
    }
    let coords: [number, number][] = data.routes[0].geometry.coordinates;
    const distanceKm = data.routes[0].distance / 1000;

    // OSRM snaps each input point to the nearest road it considers
    // "driveable". For a remote/unpaved point (or an approximate
    // coordinate) that can be far from where the mapped road actually
    // ends, in which case the returned line stops short of — or drifts
    // away from — the real marker instead of visibly reaching it. Measure
    // that snap gap ourselves and, when it's non-trivial, splice the true
    // endpoint back onto the line so it still visually reaches the marker,
    // and flag the segment uncertain since that last stretch is a filled-in
    // straight guess rather than confirmed road data.
    const SNAP_GAP_KM = 0.3; // 300m
    const startGapKm = haversineKm(from, coords[0]);
    const endGapKm = haversineKm(to, coords[coords.length - 1]);
    if (startGapKm > SNAP_GAP_KM) coords = [from, ...coords];
    if (endGapKm > SNAP_GAP_KM) coords = [...coords, to];

    // Sanity check: if OSRM's road route is a wildly implausible multiple
    // of the great-circle distance, it likely detoured onto an unrelated
    // road network rather than the actual mountain track — flag it rather
    // than presenting it as confirmed geometry.
    const ratio = straightKm > 0 ? distanceKm / straightKm : 1;
    const snapUncertain = startGapKm > SNAP_GAP_KM || endGapKm > SNAP_GAP_KM;
    if (ratio > 6 || snapUncertain) {
      return {
        coordinates: coords,
        distanceKm,
        uncertain: true,
        reason: snapUncertain
          ? `The mapped road only reaches within ${Math.max(startGapKm, endGapKm).toFixed(1)} km of this point — the rest is filled in as a straight line. Import a GPX track for exact geometry here.`
          : 'Road route detoured far beyond the direct distance — likely missing OSM data for this stretch.',
      };
    }

    return { coordinates: coords, distanceKm, uncertain: false };
  } catch (err) {
    // No confident real-world geometry available for this segment.
    // Fall back to a straight line but mark it clearly as unconfirmed.
    return {
      coordinates: [from, to],
      distanceKm: straightKm,
      uncertain: true,
      reason:
        err instanceof Error
          ? `Road routing unavailable (${err.message}). Import a GPX track for exact geometry.`
          : 'Road routing unavailable. Import a GPX track for exact geometry.',
    };
  }
}

export function segmentDistance(coords: [number, number][]): number {
  return pathDistanceKm(coords);
}

import type { RouteData } from '../types';

/**
 * Resolve every 'road' segment in a route to real road geometry, one at a
 * time (OSRM's public demo instance is rate-limited), reporting progress
 * as it goes. Segments OSRM can't confidently resolve are left flagged
 * `uncertain` rather than silently treated as accurate.
 */
export async function resolveRouteRoadSegments(
  route: RouteData,
  onProgress?: (done: number, total: number) => void
): Promise<RouteData> {
  const segments = { ...route.segments };
  const ids = Object.values(segments)
    .filter((s) => s.mode === 'road')
    .map((s) => s.id);

  for (let i = 0; i < ids.length; i++) {
    const seg = segments[ids[i]];
    const from = route.waypoints[seg.fromWaypointId];
    const to = route.waypoints[seg.toWaypointId];
    if (!from || !to) continue;
    const result = await fetchRoadRoute([from.lng, from.lat], [to.lng, to.lat]);
    segments[seg.id] = {
      ...seg,
      coordinates: result.coordinates,
      distanceKm: result.distanceKm,
      uncertain: result.uncertain,
    };
    onProgress?.(i + 1, ids.length);
  }

  return { ...route, segments };
}
