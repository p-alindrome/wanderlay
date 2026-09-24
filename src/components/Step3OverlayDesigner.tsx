import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MLMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import OverlayCanvas from './OverlayCanvas';
import { useRouteStore } from '../store/RouteStore';
import { BASEMAP_STYLE } from '../lib/mapStyle';
import { PRESETS } from '../lib/presets';
import { EXPORT_PRESETS } from '../lib/presets';
import { downloadPng, downloadSvg } from '../lib/export';
import { isHeic, convertHeicToJpegDataUrl } from '../lib/heic';
import type { MarkerShape, FontFamily, LineStyleKind, TextAlign } from '../types';

export default function Step3OverlayDesigner() {
  const { route, overlayStyle, setOverlayStyle, applyPreset, exportPresetId, setExportPresetId, customSize, setCustomSize, photo, setPhoto, setBranchVisible, setStep, overlayTransform, setOverlayTransform } = useRouteStore();
  const svgRef = useRef<SVGSVGElement>(null);
  const hiddenMapDivRef = useRef<HTMLDivElement>(null);
  const hiddenMapRef = useRef<MLMap | null>(null);
  const [mapImage, setMapImage] = useState<string | undefined>();
  const [projectFn, setProjectFn] = useState<((lng: number, lat: number) => [number, number]) | undefined>();
  const [exporting, setExporting] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const dragState = useRef<{ x: number; y: number } | null>(null);
  const [convertingPhoto, setConvertingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const preset = EXPORT_PRESETS.find((p) => p.id === exportPresetId) ?? EXPORT_PRESETS[0];
  const width = exportPresetId === 'custom' ? customSize.width : preset.width;
  const height = exportPresetId === 'custom' ? customSize.height : preset.height;

  const previewScale = Math.min(1, 460 / width, 640 / height);

  // Mirrors OverlayCanvas's own "what's actually drawn" logic so the
  // basemap snapshot (Faint/Full map modes) is framed to match the vector
  // overlay exactly — hidden branches don't stay baked into the crop.
  const allPoints = useMemo(() => {
    const shownWaypointIds = new Set<string>();
    const pts: [number, number][] = [];
    for (const branch of route.branches) {
      if (branch.visible === false) continue;
      for (const wid of branch.waypointIds) shownWaypointIds.add(wid);
      for (const segId of branch.segmentIds) {
        const seg = route.segments[segId];
        if (seg) pts.push(...seg.coordinates);
      }
    }
    for (const wp of Object.values(route.waypoints)) {
      if (wp.includeInOverlay && shownWaypointIds.has(wp.id)) pts.push([wp.lng, wp.lat]);
    }
    return pts;
  }, [route]);

  // Build a real basemap snapshot + matching pixel projection for Faint/Full map modes.
  useEffect(() => {
    if (overlayStyle.mode === 'route-only' || allPoints.length === 0) {
      setMapImage(undefined);
      setProjectFn(undefined);
      return;
    }
    if (!hiddenMapDivRef.current) return;

    hiddenMapDivRef.current.style.width = `${width}px`;
    hiddenMapDivRef.current.style.height = `${height}px`;

    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const [lng, lat] of allPoints) {
      minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    }

    if (!hiddenMapRef.current) {
      hiddenMapRef.current = new maplibregl.Map({
        container: hiddenMapDivRef.current,
        style: BASEMAP_STYLE,
        center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2],
        zoom: 8,
        interactive: false,
        attributionControl: false,
      });
    }
    const map = hiddenMapRef.current;

    function capture() {
      map!.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 80, animate: false });
      map!.once('idle', () => {
        try {
          setMapImage(map!.getCanvas().toDataURL('image/png'));
          setProjectFn(() => (lng: number, lat: number): [number, number] => {
            const p = map!.project([lng, lat]);
            return [p.x, p.y];
          });
        } catch {
          setMapImage(undefined);
        }
      });
    }

    if (map.loaded()) capture();
    else map.once('load', capture);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayStyle.mode, width, height, route]);

  async function handleExportPng() {
    if (!svgRef.current) return;
    setExporting(true);
    try {
      await downloadPng(svgRef.current, `${route.name.replace(/\s+/g, '-').toLowerCase()}-overlay.png`, width, height);
    } finally {
      setExporting(false);
    }
  }

  function handleExportSvg() {
    if (!svgRef.current) return;
    downloadSvg(svgRef.current, `${route.name.replace(/\s+/g, '-').toLowerCase()}-overlay.svg`);
  }

  function applyPhotoDataUrl(dataUrl: string) {
    const img = new Image();
    img.onload = () => {
      setPhoto({
        dataUrl,
        offsetX: 0,
        offsetY: 0,
        scale: 1,
        rotationDeg: 0,
        opacity: 0.9,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        includeInExport: photo.includeInExport,
      });
    };
    img.onerror = () => setPhotoError('That image loaded but the browser could not decode it.');
    img.src = dataUrl;
  }

  async function handlePhotoFile(file: File) {
    setPhotoError(null);
    if (isHeic(file)) {
      // No browser but Safari can decode HEIC/HEIF in an <img>, so convert
      // it to a JPEG first — otherwise it silently renders as a broken image.
      setConvertingPhoto(true);
      try {
        const dataUrl = await convertHeicToJpegDataUrl(file);
        applyPhotoDataUrl(dataUrl);
      } catch (err) {
        setPhotoError(
          err instanceof Error ? `Couldn't convert this HEIC photo: ${err.message}` : "Couldn't convert this HEIC photo."
        );
      } finally {
        setConvertingPhoto(false);
      }
      return;
    }
    const reader = new FileReader();
    reader.onload = () => applyPhotoDataUrl(reader.result as string);
    reader.onerror = () => setPhotoError('Failed to read that image file.');
    reader.readAsDataURL(file);
  }

  // The photo, positioned in full export-resolution units, for baking into
  // the exported SVG/PNG when "Include photo in export" is on. Preview-only
  // drag offsets are captured in on-screen (previewScale'd) pixels, so they
  // need dividing back up to full-res units here.
  const bakedPhoto =
    photo.includeInExport && photo.dataUrl && photo.naturalWidth && photo.naturalHeight
      ? {
          dataUrl: photo.dataUrl,
          offsetX: photo.offsetX / previewScale,
          offsetY: photo.offsetY / previewScale,
          scale: photo.scale,
          rotationDeg: photo.rotationDeg,
          opacity: photo.opacity,
          naturalWidth: photo.naturalWidth,
          naturalHeight: photo.naturalHeight,
        }
      : undefined;

  return (
    <div className="flex flex-1 min-h-0">
      <div className="w-[360px] flex flex-col border-r border-white/10 bg-[#0e0f14] min-h-0">
      <div className="flex-1 overflow-y-auto thin-scroll p-4 flex flex-col gap-5 min-h-0">
        <Section title="Preset aesthetic">
          <div className="grid grid-cols-2 gap-1.5">
            {Object.keys(PRESETS).map((id) => (
              <button
                key={id}
                onClick={() => applyPreset(id)}
                className={`text-xs py-1.5 rounded-md border capitalize ${
                  overlayStyle.presetId === id ? 'bg-white text-black border-white' : 'border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                {id.replace('-', ' ')}
              </button>
            ))}
          </div>
        </Section>

        {route.branches.length > 1 && (
          <Section title="Branches shown">
            {route.branches.map((b) => (
              <Toggle
                key={b.id}
                label={b.name}
                checked={b.visible !== false}
                onChange={(v) => setBranchVisible(b.id, v)}
              />
            ))}
            <div className="text-[11px] text-white/30 mt-0.5">
              Hides that branch's line. Shared waypoints (like a fork point) still show if another visible branch uses them.
            </div>
          </Section>
        )}

        <Section title="Map mode">
          <div className="flex gap-1">
            {([
              ['route-only', 'Route Only'],
              ['faint-map', 'Faint Map'],
              ['full-map', 'Full Map'],
            ] as const).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setOverlayStyle({ ...overlayStyle, mode: m })}
                className={`flex-1 text-xs py-1.5 rounded-md border ${
                  overlayStyle.mode === m ? 'bg-white text-black border-white' : 'border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {overlayStyle.mode === 'faint-map' && (
            <Slider label="Map opacity" value={overlayStyle.mapOpacity} min={0} max={1} step={0.05} onChange={(v) => setOverlayStyle({ ...overlayStyle, mapOpacity: v })} />
          )}
        </Section>

        <Section title="Route">
          <ColorRow label="Color" value={overlayStyle.routeColor} onChange={(v) => setOverlayStyle({ ...overlayStyle, routeColor: v })} />
          <Slider label="Thickness" value={overlayStyle.lineThicknessPx} min={0.5} max={8} step={0.5} onChange={(v) => setOverlayStyle({ ...overlayStyle, lineThicknessPx: v })} />
          <Slider label="Opacity" value={overlayStyle.lineOpacity} min={0} max={1} step={0.05} onChange={(v) => setOverlayStyle({ ...overlayStyle, lineOpacity: v })} />
          <ButtonRow<LineStyleKind>
            label="Style"
            value={overlayStyle.lineStyle}
            options={[['solid', 'Solid'], ['dashed', 'Dashed']]}
            onChange={(v) => setOverlayStyle({ ...overlayStyle, lineStyle: v })}
          />
          <Toggle label="Glow" checked={overlayStyle.glow} onChange={(v) => setOverlayStyle({ ...overlayStyle, glow: v })} />
          <Toggle label="Directional arrows" checked={overlayStyle.directionalArrows} onChange={(v) => setOverlayStyle({ ...overlayStyle, directionalArrows: v })} />
        </Section>

        <Section title="Markers">
          <ButtonRow<MarkerShape>
            label="Shape"
            value={overlayStyle.markerShape}
            options={[['dot', 'Dot'], ['circle', 'Circle'], ['pin', 'Pin'], ['custom', 'Custom']]}
            onChange={(v) => setOverlayStyle({ ...overlayStyle, markerShape: v })}
          />
          <Slider label="Size" value={overlayStyle.markerSizePx} min={2} max={14} step={1} onChange={(v) => setOverlayStyle({ ...overlayStyle, markerSizePx: v })} />
          <ColorRow label="Color" value={overlayStyle.markerColor} onChange={(v) => setOverlayStyle({ ...overlayStyle, markerColor: v })} />
        </Section>

        <Section title="Text fields">
          {(['name', 'elevation', 'coordinates', 'distance', 'date', 'custom'] as const).map((f) => (
            <Toggle
              key={f}
              label={f[0].toUpperCase() + f.slice(1)}
              checked={overlayStyle.fields[f]}
              onChange={(v) => setOverlayStyle({ ...overlayStyle, fields: { ...overlayStyle.fields, [f]: v } })}
            />
          ))}
          {overlayStyle.fields.custom && (
            <input
              value={overlayStyle.customText}
              onChange={(e) => setOverlayStyle({ ...overlayStyle, customText: e.target.value })}
              placeholder="Custom text"
              className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1 text-xs mt-1"
            />
          )}
          {overlayStyle.fields.date && (
            <input
              value={overlayStyle.tripDate}
              onChange={(e) => setOverlayStyle({ ...overlayStyle, tripDate: e.target.value })}
              placeholder="e.g. Sept 2026"
              className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1 text-xs mt-1"
            />
          )}
          <ButtonRow value={overlayStyle.unit} label="Unit" options={[['ft', 'Feet'], ['m', 'Meters']]} onChange={(v) => setOverlayStyle({ ...overlayStyle, unit: v })} />
        </Section>

        <Section title="Typography">
          <ButtonRow<FontFamily>
            label="Font"
            value={overlayStyle.fontFamily}
            options={[['Inter', 'Inter'], ['Helvetica', 'Helvetica'], ['Montserrat', 'Montserrat'], ['DM Sans', 'DM Sans']]}
            onChange={(v) => setOverlayStyle({ ...overlayStyle, fontFamily: v })}
          />
          <Slider label="Size" value={overlayStyle.fontSizePx} min={8} max={40} step={1} onChange={(v) => setOverlayStyle({ ...overlayStyle, fontSizePx: v })} />
          <Slider label="Letter spacing" value={overlayStyle.letterSpacingPx} min={0} max={8} step={0.5} onChange={(v) => setOverlayStyle({ ...overlayStyle, letterSpacingPx: v })} />
          <Slider label="Opacity" value={overlayStyle.textOpacity} min={0} max={1} step={0.05} onChange={(v) => setOverlayStyle({ ...overlayStyle, textOpacity: v })} />
          <ButtonRow<TextAlign> label="Align" value={overlayStyle.textAlign} options={[['left', 'Left'], ['center', 'Center'], ['right', 'Right']]} onChange={(v) => setOverlayStyle({ ...overlayStyle, textAlign: v })} />
          <ColorRow label="Color" value={overlayStyle.textColor} onChange={(v) => setOverlayStyle({ ...overlayStyle, textColor: v })} />
          <Toggle
            label="Halo (legibility on photos)"
            checked={overlayStyle.textHalo}
            onChange={(v) => setOverlayStyle({ ...overlayStyle, textHalo: v })}
          />
        </Section>

        <Section title="Photo">
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*,.heic,.heif"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handlePhotoFile(e.target.files[0])}
          />
          <button
            onClick={() => photoInputRef.current?.click()}
            disabled={convertingPhoto}
            className="w-full text-xs py-1.5 rounded-md border border-white/15 hover:bg-white/10 disabled:opacity-50"
          >
            {convertingPhoto ? 'Converting HEIC photo…' : photo.dataUrl ? 'Replace photo' : 'Upload photo'}
          </button>
          {photoError && <div className="text-[11px] text-amber-300/80">{photoError}</div>}
          <div className="text-[11px] text-white/30">
            iPhone HEIC photos are converted to JPEG automatically.
          </div>
          {photo.dataUrl && (
            <>
              <Slider label="Scale" value={photo.scale} min={0.3} max={3} step={0.05} onChange={(v) => setPhoto({ ...photo, scale: v })} />
              <Slider label="Rotation" value={photo.rotationDeg} min={-180} max={180} step={1} onChange={(v) => setPhoto({ ...photo, rotationDeg: v })} />
              <Slider label="Opacity" value={photo.opacity} min={0.1} max={1} step={0.05} onChange={(v) => setPhoto({ ...photo, opacity: v })} />
              <div className="pt-1 border-t border-white/10">
                <Toggle
                  label="Include photo in export"
                  checked={!!photo.includeInExport}
                  onChange={(v) => setPhoto({ ...photo, includeInExport: v })}
                />
                <div className="text-[11px] text-white/30 mt-1">
                  {photo.includeInExport
                    ? 'PNG/SVG exports will be a flattened image with the photo baked in (no transparency).'
                    : "Photo is preview-only — exports stay a transparent overlay you place over the photo yourself (e.g. in Canva/Photoshop). Turn this on to download the composite directly."}
                </div>
              </div>
              <button
                onClick={() => setPhoto({ dataUrl: undefined, offsetX: 0, offsetY: 0, scale: 1, rotationDeg: 0, opacity: 0.9, includeInExport: false })}
                className="w-full text-xs py-1 text-white/40 hover:text-red-400"
              >
                Remove photo
              </button>
            </>
          )}
        </Section>

        <Section title="Overlay position & size">
          <div className="text-[11px] text-white/30 -mt-1 mb-1">
            Move and resize the route/markers/labels graphic on its own — handy for placing it like a sticker on a photo.
          </div>
          <Slider
            label="Horizontal"
            value={overlayTransform.offsetX}
            min={-width}
            max={width}
            step={1}
            onChange={(v) => setOverlayTransform({ ...overlayTransform, offsetX: v })}
          />
          <Slider
            label="Vertical"
            value={overlayTransform.offsetY}
            min={-height}
            max={height}
            step={1}
            onChange={(v) => setOverlayTransform({ ...overlayTransform, offsetY: v })}
          />
          <Slider
            label="Scale"
            value={overlayTransform.scale}
            min={0.2}
            max={2}
            step={0.02}
            onChange={(v) => setOverlayTransform({ ...overlayTransform, scale: v })}
          />
          {(overlayTransform.offsetX !== 0 || overlayTransform.offsetY !== 0 || overlayTransform.scale !== 1) && (
            <button
              onClick={() => setOverlayTransform({ offsetX: 0, offsetY: 0, scale: 1 })}
              className="w-full text-xs py-1 text-white/40 hover:text-white/70"
            >
              Reset position &amp; size
            </button>
          )}
        </Section>

        <Section title="Export size">
          <select
            value={exportPresetId}
            onChange={(e) => setExportPresetId(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-xs"
          >
            {EXPORT_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          {exportPresetId === 'custom' && (
            <div className="flex gap-2 mt-1.5">
              <input type="number" value={customSize.width} onChange={(e) => setCustomSize(parseInt(e.target.value) || 1, customSize.height)} className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1 text-xs" />
              <span className="text-white/30 self-center">×</span>
              <input type="number" value={customSize.height} onChange={(e) => setCustomSize(customSize.width, parseInt(e.target.value) || 1)} className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1 text-xs" />
            </div>
          )}
        </Section>
      </div>

      {/* Fixed footer — always visible, never scrolls out of view */}
      <div className="shrink-0 p-4 pt-3 border-t border-white/10 bg-[#0e0f14]">
        <button onClick={() => setStep(2)} className="text-xs text-white/40 hover:text-white/70 mb-2">
          ← Back to Route Editor
        </button>
        <div className="flex gap-2">
          <button onClick={handleExportPng} disabled={exporting} className="flex-1 py-2 rounded-md bg-white text-black text-sm hover:bg-white/90 disabled:opacity-50">
            {exporting ? 'Exporting…' : 'Export PNG'}
          </button>
          <button onClick={handleExportSvg} className="flex-1 py-2 rounded-md border border-white/20 text-sm hover:bg-white/10">
            Export SVG
          </button>
        </div>
      </div>
      </div>

      <div className="flex-1 flex items-center justify-center overflow-auto bg-[#05060a] bg-[radial-gradient(circle_at_center,_#151824_0%,_#05060a_70%)] p-8">
        <div
          className="relative shadow-2xl"
          style={{ width: width * previewScale, height: height * previewScale }}
        >
          {photo.dataUrl && (
            // Always present (even when the photo is now drawn via the SVG
            // below) so dragging to reposition keeps working either way —
            // only the visible <img> inside is conditional.
            <div
              className="absolute inset-0 overflow-hidden cursor-move select-none"
              onMouseDown={(e) => { dragState.current = { x: e.clientX - photo.offsetX, y: e.clientY - photo.offsetY }; }}
              onMouseMove={(e) => {
                if (!dragState.current) return;
                setPhoto({ ...photo, offsetX: e.clientX - dragState.current.x, offsetY: e.clientY - dragState.current.y });
              }}
              onMouseUp={() => (dragState.current = null)}
              onMouseLeave={() => (dragState.current = null)}
            >
              {!photo.includeInExport && (
                <img
                  src={photo.dataUrl}
                  alt="uploaded"
                  className="absolute top-1/2 left-1/2 max-w-none"
                  style={{
                    transform: `translate(-50%, -50%) translate(${photo.offsetX}px, ${photo.offsetY}px) scale(${photo.scale}) rotate(${photo.rotationDeg}deg)`,
                    opacity: photo.opacity,
                    width: width * previewScale,
                  }}
                />
              )}
            </div>
          )}
          {/* pointer-events-none so dragging the photo underneath still works even though this layer paints on top */}
          <div className="pointer-events-none" style={{ transform: `scale(${previewScale})`, transformOrigin: 'top left', width, height }}>
            <OverlayCanvas
              ref={svgRef}
              route={route}
              style={overlayStyle}
              width={width}
              height={height}
              mapImage={mapImage}
              projectOverride={projectFn}
              bakedPhoto={bakedPhoto}
              transform={overlayTransform}
            />
          </div>
        </div>
      </div>

      <div ref={hiddenMapDivRef} style={{ position: 'fixed', left: -99999, top: 0, pointerEvents: 'none' }} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-white/40 mb-2">{title}</div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-white/60">
      <span className="w-28 shrink-0">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="flex-1" />
      <span className="w-10 text-right text-white/40">{value}</span>
    </label>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-white/60">
      <span className="w-28 shrink-0">{label}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-8 h-6 bg-transparent border border-white/10 rounded" />
      <span className="text-white/40">{value}</span>
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-white/60 justify-between">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function ButtonRow<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center gap-2 text-xs text-white/60">
      <span className="w-28 shrink-0">{label}</span>
      <div className="flex gap-1 flex-1">
        {options.map(([v, l]) => (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={`flex-1 py-1 rounded-md border text-[11px] ${value === v ? 'bg-white text-black border-white' : 'border-white/10 hover:bg-white/10'}`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}
