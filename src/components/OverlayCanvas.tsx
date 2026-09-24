import { forwardRef, useMemo } from 'react';
import type { OverlayStyle, RouteData, OverlayTransform } from '../types';
import { fitProjection, formatElevation, formatCoords, waypointDistanceFromBranchStart, uid } from '../lib/geo';

const FONT_STACK: Record<OverlayStyle['fontFamily'], string> = {
  Inter: 'Inter, system-ui, sans-serif',
  Helvetica: 'Helvetica, Arial, sans-serif',
  Montserrat: 'Montserrat, system-ui, sans-serif',
  'DM Sans': '"DM Sans", system-ui, sans-serif',
};

/** Picks a halo that contrasts with the label color, so it reads whether
 *  the label sits on a bright sky, a dark rock face, or a busy map. */
function haloColorFor(hexColor: string): string {
  const hex = hexColor.replace('#', '');
  if (hex.length !== 6) return 'rgba(0,0,0,0.6)';
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.55 ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.7)';
}

interface BakedPhoto {
  dataUrl: string;
  /** already converted to full export-resolution pixel units by the caller */
  offsetX: number;
  offsetY: number;
  scale: number;
  rotationDeg: number;
  opacity: number;
  naturalWidth: number;
  naturalHeight: number;
}

interface Props {
  route: RouteData;
  style: OverlayStyle;
  width: number;
  height: number;
  mapImage?: string; // rendered basemap snapshot, only used for faint-map/full-map modes
  projectOverride?: (lng: number, lat: number) => [number, number];
  /** when set, the uploaded photo is drawn as part of this SVG (so it's
   *  included when the SVG is exported) instead of only in the on-screen
   *  preview — see Step3OverlayDesigner's "Include photo in export" toggle. */
  bakedPhoto?: BakedPhoto;
  /** repositions/resizes the route+markers+labels (and basemap, if any) as
   *  one unit — independent of the photo's own position/scale — so the
   *  overlay can be shrunk and placed like a sticker anywhere on a photo.
   *  Values are in the same pixel units as width/height. Defaults to
   *  {offsetX:0, offsetY:0, scale:1} (today's full-canvas fit). */
  transform?: OverlayTransform;
}

function markerPath(shape: OverlayStyle['markerShape'], size: number): string {
  switch (shape) {
    case 'pin':
      // classic map-pin teardrop, point down
      return `M0,${-size * 1.6} C ${size},${-size * 1.6} ${size},${-size * 0.2} 0,${size * 0.6} C ${-size},${-size * 0.2} ${-size},${-size * 1.6} 0,${-size * 1.6} Z`;
    case 'custom': {
      // 4-point compass star — a bit more "expedition" than a plain diamond
      const outer = size * 1.3;
      const inner = size * 0.42;
      const pts: [number, number][] = [];
      for (let i = 0; i < 8; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const angle = (Math.PI / 4) * i - Math.PI / 2;
        pts.push([r * Math.cos(angle), r * Math.sin(angle)]);
      }
      return pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ') + ' Z';
    }
    default:
      return '';
  }
}

const OverlayCanvas = forwardRef<SVGSVGElement, Props>(function OverlayCanvas(
  { route, style, width, height, mapImage, projectOverride, bakedPhoto, transform },
  ref
) {
  const t = transform ?? { offsetX: 0, offsetY: 0, scale: 1 };
  const overlayGroupTransform = `translate(${width / 2 + t.offsetX},${height / 2 + t.offsetY}) scale(${t.scale}) translate(${-width / 2},${-height / 2})`;
  const uidRef = useMemo(() => uid(), []);

  // Waypoints that belong to at least one currently-visible branch — used
  // both to fit the view and to decide which markers/labels to draw, so a
  // waypoint that only exists on a hidden branch doesn't float on its own
  // with no line once that branch is switched off.
  const shownWaypointIds = useMemo(() => {
    const ids = new Set<string>();
    for (const branch of route.branches) {
      if (branch.visible === false) continue;
      for (const wid of branch.waypointIds) ids.add(wid);
    }
    return ids;
  }, [route.branches]);

  const allPoints = useMemo(() => {
    const pts: [number, number][] = [];
    for (const branch of route.branches) {
      if (branch.visible === false) continue;
      for (const segId of branch.segmentIds) {
        const seg = route.segments[segId];
        if (seg) pts.push(...seg.coordinates);
      }
    }
    for (const wp of Object.values(route.waypoints)) {
      if (wp.includeInOverlay && shownWaypointIds.has(wp.id)) pts.push([wp.lng, wp.lat]);
    }
    return pts;
  }, [route, shownWaypointIds]);

  const project = useMemo(() => {
    if (projectOverride) return projectOverride;
    return fitProjection(allPoints, width, height, 90).project;
  }, [projectOverride, allPoints, width, height]);

  const glowId = `glow-${uidRef}`;
  const fontFamily = FONT_STACK[style.fontFamily];

  return (
    <svg
      ref={ref}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ background: 'transparent' }}
    >
      <defs>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {bakedPhoto && (() => {
        // Reproduces the on-screen photo positioning exactly: place the
        // photo's own center at (canvas center + drag offset), then rotate
        // and scale about that same center — matches the CSS
        // translate(-50%,-50%) translate(offset) scale() rotate() used for
        // the live preview <img>, just expressed as an SVG transform.
        const w = width;
        const h = w * (bakedPhoto.naturalHeight / bakedPhoto.naturalWidth);
        const cx = width / 2 + bakedPhoto.offsetX;
        const cy = height / 2 + bakedPhoto.offsetY;
        return (
          <g transform={`translate(${cx},${cy}) rotate(${bakedPhoto.rotationDeg}) scale(${bakedPhoto.scale})`}>
            <image
              href={bakedPhoto.dataUrl}
              x={-w / 2}
              y={-h / 2}
              width={w}
              height={h}
              opacity={bakedPhoto.opacity}
              preserveAspectRatio="none"
            />
          </g>
        );
      })()}

      {/* Route + markers + labels (and basemap, if any) move/resize together as one unit, independent of the photo underneath */}
      <g transform={overlayGroupTransform}>

      {(style.mode === 'faint-map' || style.mode === 'full-map') && mapImage && (
        <image
          href={mapImage}
          x={0}
          y={0}
          width={width}
          height={height}
          opacity={style.mode === 'faint-map' ? style.mapOpacity : 1}
          preserveAspectRatio="xMidYMid slice"
        />
      )}

      {/* Route lines */}
      {route.branches
        .filter((branch) => branch.visible !== false)
        .map((branch) =>
        branch.segmentIds.map((segId) => {
          const seg = route.segments[segId];
          if (!seg) return null;
          const d = seg.coordinates
            .map((c, i) => `${i === 0 ? 'M' : 'L'} ${project(c[0], c[1]).join(',')}`)
            .join(' ');
          const dash = style.lineStyle === 'dashed' ? `${style.lineThicknessPx * 3},${style.lineThicknessPx * 2.5}` : undefined;
          return (
            <g key={segId}>
              {style.glow && (
                <path
                  d={d}
                  fill="none"
                  stroke={style.routeColor}
                  strokeWidth={style.lineThicknessPx * 2.2}
                  strokeOpacity={style.lineOpacity * 0.6}
                  filter={`url(#${glowId})`}
                  strokeDasharray={dash}
                  strokeLinecap="round"
                />
              )}
              <path
                d={d}
                fill="none"
                stroke={style.routeColor}
                strokeWidth={style.lineThicknessPx}
                strokeOpacity={seg.uncertain ? style.lineOpacity * 0.55 : style.lineOpacity}
                strokeDasharray={seg.uncertain ? `${style.lineThicknessPx * 2},${style.lineThicknessPx * 2}` : dash}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {style.directionalArrows && seg.coordinates.length >= 2 && (
                <Arrow
                  a={project(seg.coordinates[Math.floor(seg.coordinates.length / 2) - 1]?.[0] ?? seg.coordinates[0][0], seg.coordinates[Math.floor(seg.coordinates.length / 2) - 1]?.[1] ?? seg.coordinates[0][1])}
                  b={project(seg.coordinates[Math.floor(seg.coordinates.length / 2)][0], seg.coordinates[Math.floor(seg.coordinates.length / 2)][1])}
                  color={style.routeColor}
                  size={style.lineThicknessPx * 3 + 4}
                  opacity={style.lineOpacity}
                />
              )}
            </g>
          );
        })
      )}

      {/* Markers + labels */}
      {Object.values(route.waypoints)
        .filter((wp) => wp.includeInOverlay && shownWaypointIds.has(wp.id))
        .map((wp) => {
          const [x, y] = project(wp.lng, wp.lat);
          const size = style.markerSizePx * (wp.isDestination ? 1.5 : 1);
          const lines: string[] = [];
          if (style.fields.name) lines.push((wp.customLabel || wp.name).toUpperCase());
          if (style.fields.elevation && wp.elevationM !== undefined) lines.push(formatElevation(wp.elevationM, style.unit));
          if (style.fields.coordinates) lines.push(formatCoords(wp.lat, wp.lng));
          if (style.fields.distance) {
            const d = waypointDistanceFromBranchStart(route, wp.id);
            if (d !== undefined) lines.push(`${d.toFixed(1)} KM`);
          }
          if (style.fields.date && style.tripDate) lines.push(style.tripDate.toUpperCase());
          if (style.fields.custom && style.customText) lines.push(style.customText.toUpperCase());

          return (
            <g key={wp.id}>
              {style.markerShape === 'dot' && <circle cx={x} cy={y} r={size / 2} fill={style.markerColor} />}
              {style.markerShape === 'circle' && (
                <circle cx={x} cy={y} r={size} fill="none" stroke={style.markerColor} strokeWidth={1.5} />
              )}
              {(style.markerShape === 'pin' || style.markerShape === 'custom') && (
                <g transform={`translate(${x},${y})`}>
                  <path d={markerPath(style.markerShape, size)} fill={style.markerColor} />
                  {style.markerShape === 'pin' && <circle cx={0} cy={-size * 1.6} r={size * 0.4} fill="#0b0c10" opacity={0.65} />}
                </g>
              )}
              {wp.showLabel && lines.length > 0 && (
                <text
                  x={x}
                  y={y + size + 14}
                  textAnchor={style.textAlign === 'left' ? 'start' : style.textAlign === 'right' ? 'end' : 'middle'}
                  fill={style.textColor}
                  fillOpacity={style.textOpacity}
                  fontFamily={fontFamily}
                  fontSize={wp.isDestination ? style.fontSizePx * 1.25 : style.fontSizePx}
                  letterSpacing={style.letterSpacingPx}
                  stroke={style.textHalo ? haloColorFor(style.textColor) : 'none'}
                  strokeWidth={style.textHalo ? Math.max(2, style.fontSizePx * 0.14) : 0}
                  strokeLinejoin="round"
                  style={{ fontWeight: wp.isDestination ? 600 : 400, paintOrder: 'stroke fill' }}
                >
                  {lines.map((line, i) => (
                    <tspan key={i} x={x} dy={i === 0 ? 0 : (wp.isDestination ? style.fontSizePx * 1.25 : style.fontSizePx) * 1.3}>
                      {line}
                    </tspan>
                  ))}
                </text>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
});

function Arrow({ a, b, color, size, opacity }: { a: [number, number]; b: [number, number]; color: string; size: number; opacity: number }) {
  // A small filled chevron/triangle pointing along the direction of travel —
  // reads more clearly than a plain two-stroke "v" at small sizes.
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const [cx, cy] = b;
  const tip: [number, number] = [cx + size * 0.6 * Math.cos(angle), cy + size * 0.6 * Math.sin(angle)];
  const p1: [number, number] = [cx - size * Math.cos(angle - Math.PI / 7), cy - size * Math.sin(angle - Math.PI / 7)];
  const p2: [number, number] = [cx - size * Math.cos(angle + Math.PI / 7), cy - size * Math.sin(angle + Math.PI / 7)];
  return (
    <path
      d={`M${tip[0]},${tip[1]} L${p1[0]},${p1[1]} L${cx},${cy} L${p2[0]},${p2[1]} Z`}
      fill={color}
      fillOpacity={opacity}
      stroke="none"
    />
  );
}

export default OverlayCanvas;
