import type { RouteData, Waypoint, RouteBranch } from '../types';
import { uid } from '../lib/geo';

// Real-world reference coordinates (WGS84) and elevations for the demo
// journey, sourced from surveyed/Wikipedia-cited data where available.
// A few remote points (Chatru, Batal, and the Zanskar-side waypoint near
// Gonbo Rangjon) only have approximate, unsurveyed coordinates commonly
// cited by trip reports — they are labeled "(approx.)" in the UI and the
// app will still recompute real road/track geometry between them at
// runtime rather than trusting these points blindly. Kunzum Pass is
// intentionally NOT included anywhere in this route.
interface DemoPoint {
  key: string;
  name: string;
  lat: number;
  lng: number;
  elevationM?: number;
  isDestination?: boolean;
  approx?: boolean;
  /** false = keep the point (for path geometry / anchoring) but don't draw its text label.
   *  Used for connective points that sit close to a nearby labeled destination and
   *  would otherwise overlap it — matches how these are shown in a plain route sketch,
   *  as an unlabeled line passing near/through the point rather than its own callout. */
  showLabel?: boolean;
}

const POINTS: DemoPoint[] = [
  { key: 'manali', name: 'Manali', lat: 32.2432, lng: 77.1892, elevationM: 2050 },
  { key: 'atal-tunnel', name: 'Atal Tunnel', lat: 32.36353, lng: 77.13308, elevationM: 3060 },
  { key: 'sissu', name: 'Sissu', lat: 32.48333, lng: 77.11667, elevationM: 3120 },
  { key: 'tandi', name: 'Tandi', lat: 32.5508, lng: 76.9759, elevationM: 3030 },
  { key: 'keylong', name: 'Keylong', lat: 32.57083, lng: 77.03167, elevationM: 3080 },
  { key: 'jispa', name: 'Jispa', lat: 32.63333, lng: 77.16667, elevationM: 3200 },
  { key: 'darcha', name: 'Darcha', lat: 32.674, lng: 77.216, elevationM: 3360 },

  // Route A
  { key: 'baralacha-la', name: 'Baralacha La', lat: 32.75861, lng: 77.42028, elevationM: 4889, isDestination: true },

  // Route B -> Zanskar
  { key: 'shinkula-top', name: 'Shinkula Top', lat: 32.9089, lng: 77.1997, elevationM: 5091, isDestination: true },
  { key: 'zanskar', name: 'Zanskar (Lakhang)', lat: 32.935, lng: 77.23, approx: true, showLabel: false },
  { key: 'gonbo-rangjon', name: 'Gonbo Rangjon', lat: 32.9569, lng: 77.2583, elevationM: 5520, isDestination: true },

  // Chandratal branch
  { key: 'koksar', name: 'Koksar', lat: 32.414, lng: 77.235, elevationM: 3140 },
  { key: 'chatru', name: 'Chatru', lat: 32.365, lng: 77.34, elevationM: 3560, approx: true },
  { key: 'batal', name: 'Batal', lat: 32.45, lng: 77.55, elevationM: 3960, approx: true },
  { key: 'chandratal', name: 'Chandratal', lat: 32.47518, lng: 77.61706, elevationM: 4300, isDestination: true },
];

function toWaypoint(p: DemoPoint): Waypoint {
  return {
    id: p.key,
    name: p.approx ? `${p.name} (approx.)` : p.name,
    lat: p.lat,
    lng: p.lng,
    elevationM: p.elevationM,
    showLabel: p.showLabel ?? true,
    isDestination: !!p.isDestination,
    includeInOverlay: true,
    source: 'demo',
  };
}

/**
 * Builds the demo journey with waypoints only. Segment geometry between
 * consecutive waypoints is intentionally left for the routing layer
 * (see lib/routing.ts) to resolve from real road/track data at load time,
 * rather than baked in here as straight lines.
 */
export function buildDemoRoute(): RouteData {
  const waypoints: Record<string, Waypoint> = {};
  for (const p of POINTS) waypoints[p.key] = toWaypoint(p);

  const toDarcha = ['manali', 'atal-tunnel', 'sissu', 'tandi', 'keylong', 'jispa', 'darcha'];

  // Each of these is a full, self-contained "Manali → destination" route —
  // not just the tail past a fork — so hiding/showing one in Step 3
  // doesn't depend on some other "trunk" branch also being visible. The
  // shared stretches (e.g. Manali → Darcha, or Darcha → Shinkula Top) are
  // still only stored once: getOrCreateSegment() below reuses the same
  // segment object across every branch that passes through it.
  const routeDefs: { name: string; ids: string[]; color: string }[] = [
    { name: 'Manali → Baralacha La', ids: [...toDarcha, 'baralacha-la'], color: '#f2c14e' },
    { name: 'Manali → Shinkula Top', ids: [...toDarcha, 'shinkula-top'], color: '#7fb8f0' },
    { name: 'Manali → Gonbo Rangjon', ids: [...toDarcha, 'shinkula-top', 'zanskar', 'gonbo-rangjon'], color: '#c9a0f5' },
    { name: 'Manali → Chandratal', ids: ['manali', 'atal-tunnel', 'koksar', 'chatru', 'batal', 'chandratal'], color: '#e08a8a' },
  ];

  const segments: RouteData['segments'] = {};
  const segmentIdByPair = new Map<string, string>();

  function getOrCreateSegment(fromId: string, toId: string): string {
    const key = `${fromId}>${toId}`;
    const existing = segmentIdByPair.get(key);
    if (existing) return existing;
    const id = uid();
    segments[id] = {
      id,
      fromWaypointId: fromId,
      toWaypointId: toId,
      mode: 'road',
      coordinates: [
        [waypoints[fromId].lng, waypoints[fromId].lat],
        [waypoints[toId].lng, waypoints[toId].lat],
      ],
      uncertain: true, // resolved to real geometry on load; see resolveRouteRoadSegments()
    };
    segmentIdByPair.set(key, id);
    return id;
  }

  const branches: RouteBranch[] = routeDefs.map(({ name, ids, color }) => {
    const segIds = ids.slice(1).map((toId, i) => getOrCreateSegment(ids[i], toId));
    return { id: uid(), name, waypointIds: ids, segmentIds: segIds, color, visible: true };
  });

  const now = new Date().toISOString();
  return {
    id: 'demo-manali-spiti-zanskar',
    name: 'Manali · Darcha · Baralacha-Shinkula-Zanskar · Chandratal',
    waypoints,
    segments,
    branches,
    createdAt: now,
    updatedAt: now,
  };
}
