// Geo + projection helpers.
//
// We use standard Web Mercator (the same projection MapLibre/OSM/Google Maps
// use) so that shapes drawn on the transparent overlay match the real
// geometry of the route, and so that when a raster basemap snapshot is
// composited behind the overlay (Faint Map / Full Map modes) the vector
// path lines up with the map pixels.

const TILE_SIZE = 256;

export function lngLatToWorldPx(lng: number, lat: number, zoom: number): [number, number] {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  const x = ((lng + 180) / 360) * scale;
  const latRad = (lat * Math.PI) / 180;
  const y =
    (0.5 - Math.log(Math.tan(Math.PI / 4 + latRad / 2)) / (2 * Math.PI)) * scale;
  return [x, y];
}

export function haversineKm(a: [number, number], b: [number, number]): number {
  // a, b are [lng, lat]
  const R = 6371;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function pathDistanceKm(coords: [number, number][]): number {
  let d = 0;
  for (let i = 1; i < coords.length; i++) d += haversineKm(coords[i - 1], coords[i]);
  return d;
}

export interface FitProjection {
  project: (lng: number, lat: number) => [number, number];
  zoom: number;
  center: [number, number];
}

/**
 * Build a projection function that fits every point in `points` inside a
 * canvasWidth x canvasHeight box (with padding), using true Web Mercator
 * math so bearings/curvature reflect the real world.
 */
export function fitProjection(
  points: [number, number][],
  canvasWidth: number,
  canvasHeight: number,
  paddingPx = 60
): FitProjection {
  if (points.length === 0) {
    return { project: () => [canvasWidth / 2, canvasHeight / 2], zoom: 10, center: [0, 0] };
  }
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of points) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  const centerLng = (minLng + maxLng) / 2;
  const centerLat = (minLat + maxLat) / 2;

  const availW = Math.max(canvasWidth - paddingPx * 2, 10);
  const availH = Math.max(canvasHeight - paddingPx * 2, 10);

  // Binary-search-free approach: compute required zoom directly.
  let zoom = 18;
  for (; zoom > 0; zoom -= 0.05) {
    const [x0, y0] = lngLatToWorldPx(minLng, maxLat, zoom);
    const [x1, y1] = lngLatToWorldPx(maxLng, minLat, zoom);
    const w = Math.abs(x1 - x0);
    const h = Math.abs(y1 - y0);
    if (w <= availW && h <= availH) break;
  }

  const [centerX, centerY] = lngLatToWorldPx(centerLng, centerLat, zoom);

  const project = (lng: number, lat: number): [number, number] => {
    const [x, y] = lngLatToWorldPx(lng, lat, zoom);
    return [canvasWidth / 2 + (x - centerX), canvasHeight / 2 + (y - centerY)];
  };

  return { project, zoom, center: [centerLng, centerLat] };
}

export function metersToFeet(m: number): number {
  return m * 3.28084;
}

export function formatElevation(m: number | undefined, unit: 'ft' | 'm'): string {
  if (m === undefined) return '—';
  return unit === 'ft' ? `${Math.round(metersToFeet(m)).toLocaleString()} FT` : `${Math.round(m).toLocaleString()} M`;
}

export function formatCoords(lat: number, lng: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}°${latDir} ${Math.abs(lng).toFixed(4)}°${lngDir}`;
}

import type { RouteData } from '../types';

/**
 * Cumulative real-path distance (km) from the start of the first branch
 * that contains `waypointId`, walking the branch's actual segment
 * geometry (not straight lines between waypoints).
 */
export function waypointDistanceFromBranchStart(route: RouteData, waypointId: string): number | undefined {
  for (const branch of route.branches) {
    const idx = branch.waypointIds.indexOf(waypointId);
    if (idx <= 0) continue;
    let total = 0;
    for (let i = 0; i < idx; i++) {
      const segId = branch.segmentIds[i];
      const seg = route.segments[segId];
      if (seg) total += pathDistanceKm(seg.coordinates);
    }
    return total;
  }
  return undefined;
}

export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export interface BranchStats {
  distanceKm: number;
  gainM: number;
  lossM: number;
  pointCount: number;
  /** true if any segment on this branch is a straight-line guess rather than confirmed road/track data */
  hasUncertainSegment: boolean;
}

/** Live distance/elevation summary for one branch, using its actual resolved segment geometry. */
export function branchStats(route: RouteData, branchId: string): BranchStats {
  const branch = route.branches.find((b) => b.id === branchId);
  const stats: BranchStats = { distanceKm: 0, gainM: 0, lossM: 0, pointCount: branch?.waypointIds.length ?? 0, hasUncertainSegment: false };
  if (!branch) return stats;

  for (const segId of branch.segmentIds) {
    const seg = route.segments[segId];
    if (!seg) continue;
    stats.distanceKm += pathDistanceKm(seg.coordinates);
    if (seg.uncertain) stats.hasUncertainSegment = true;
  }

  for (let i = 1; i < branch.waypointIds.length; i++) {
    const a = route.waypoints[branch.waypointIds[i - 1]];
    const b = route.waypoints[branch.waypointIds[i]];
    if (!a || !b || a.elevationM === undefined || b.elevationM === undefined) continue;
    const diff = b.elevationM - a.elevationM;
    if (diff > 0) stats.gainM += diff;
    else stats.lossM += -diff;
  }

  return stats;
}
