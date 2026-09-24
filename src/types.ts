// Core domain types for Wanderlay

export interface Waypoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** meters. undefined = not yet looked up */
  elevationM?: number;
  /** optional short label to draw on the overlay instead of `name` */
  customLabel?: string;
  /** true = show on the overlay canvas */
  showLabel: boolean;
  /** true = styled as a "destination" (bigger marker / bigger type) */
  isDestination: boolean;
  /** whether this point is one the user picked to appear in the final overlay */
  includeInOverlay: boolean;
  /** how this point was created */
  source: 'search' | 'click' | 'gpx' | 'demo' | 'manual';
}

export type RouteSegmentMode = 'road' | 'manual' | 'gpx';

export interface RouteSegment {
  id: string;
  /** waypoint ids this segment connects, in order */
  fromWaypointId: string;
  toWaypointId: string;
  mode: RouteSegmentMode;
  /** [lng, lat][] actual real-world geometry for this segment */
  coordinates: [number, number][];
  /** true when we could NOT confidently resolve real road/track geometry
   *  (e.g. OSRM had no road data for a remote mountain track). When true,
   *  the geometry above is a straight-line placeholder and the UI must
   *  visibly flag it as unconfirmed rather than presenting it as fact. */
  uncertain: boolean;
  distanceKm?: number;
}

export interface RouteBranch {
  id: string;
  name: string;
  /** ordered waypoint ids belonging to this branch, including the shared
   *  trunk point(s) it forks from */
  waypointIds: string[];
  segmentIds: string[];
  color?: string;
  /** false = hide this branch's line on the overlay entirely (its shared
   *  waypoints may still be visible via other branches / their own
   *  includeInOverlay flag). Defaults to true when unset. */
  visible?: boolean;
}

export interface RouteData {
  id: string;
  name: string;
  waypoints: Record<string, Waypoint>;
  segments: Record<string, RouteSegment>;
  branches: RouteBranch[];
  createdAt: string;
  updatedAt: string;
}

export type MarkerShape = 'dot' | 'circle' | 'pin' | 'custom';
export type LineStyleKind = 'solid' | 'dashed';
export type MapMode = 'route-only' | 'faint-map' | 'full-map';
export type FontFamily = 'Inter' | 'Helvetica' | 'Montserrat' | 'DM Sans';
export type TextAlign = 'left' | 'center' | 'right';

export interface TextFieldToggles {
  name: boolean;
  elevation: boolean;
  coordinates: boolean;
  distance: boolean;
  date: boolean;
  custom: boolean;
}

export interface OverlayStyle {
  presetId: string;
  mode: MapMode;
  mapOpacity: number; // used for faint-map mode, 0-1

  routeColor: string;
  lineThicknessPx: number;
  lineOpacity: number;
  lineStyle: LineStyleKind;
  glow: boolean;
  directionalArrows: boolean;

  markerShape: MarkerShape;
  markerSizePx: number;
  markerColor: string;

  fontFamily: FontFamily;
  fontSizePx: number;
  letterSpacingPx: number;
  textOpacity: number;
  textAlign: TextAlign;
  textColor: string;
  /** subtle contrasting outline behind label text so it stays legible over a photo or busy map, not just flat color on transparent */
  textHalo: boolean;

  fields: TextFieldToggles;
  customText: string;
  tripDate: string;
  unit: 'ft' | 'm';
}

export interface ExportPreset {
  id: string;
  label: string;
  width: number;
  height: number;
}

export interface OverlayTransform {
  offsetX: number;
  offsetY: number;
  scale: number;
}

export interface PhotoState {
  dataUrl?: string;
  offsetX: number;
  offsetY: number;
  scale: number;
  rotationDeg: number;
  opacity: number;
  /** intrinsic pixel size of the uploaded photo, filled in once it loads —
   *  needed to draw it at the right aspect ratio in the export SVG */
  naturalWidth?: number;
  naturalHeight?: number;
  /** false (default) = photo is preview-only, matching the original
   *  "exported overlay always stays transparent" behavior. true = bake
   *  the photo into the PNG/SVG export as a flattened composite. */
  includeInExport?: boolean;
}
