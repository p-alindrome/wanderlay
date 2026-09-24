import { useEffect, useRef, useState } from 'react';
import type { Map as MLMap } from 'maplibre-gl';
import MapView from './MapView';
import WaypointList from './WaypointList';
import { useRouteStore } from '../store/RouteStore';
import { searchPlace, type GeocodeResult } from '../lib/geocode';
import { parseGpx } from '../lib/gpx';
import { fetchRoadRoute, resolveRouteRoadSegments } from '../lib/routing';
import { fetchElevations } from '../lib/elevation';
import { uid, branchStats, metersToFeet } from '../lib/geo';
import { buildDemoRoute } from '../data/demoRoute';
import type { Waypoint } from '../types';

const SRC_LINES = 'route-lines';
const SRC_POINTS = 'route-points';

export default function Step1CreateRoute() {
  const store = useRouteStore();
  const { route, setRoute, activeBranchId, setActiveBranchId, addWaypoint, removeWaypoint, reorderWaypoint, addBranch } = store;
  const mapRef = useRef<MLMap | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [clickMode, setClickMode] = useState<'off' | 'road' | 'manual'>('road');
  const [busy, setBusy] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<number | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  const activeBranch = route.branches.find((b) => b.id === activeBranchId) ?? route.branches[0];
  const stats = branchStats(route, activeBranch.id);

  function ensureLayers(map: MLMap) {
    if (!map.getSource(SRC_LINES)) {
      map.addSource(SRC_LINES, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: SRC_LINES,
        type: 'line',
        source: SRC_LINES,
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 3,
          'line-dasharray': ['case', ['get', 'uncertain'], ['literal', [2, 2]], ['literal', [1, 0]]],
          'line-opacity': ['case', ['get', 'uncertain'], 0.55, 0.95],
        },
      });
    }
    if (!map.getSource(SRC_POINTS)) {
      map.addSource(SRC_POINTS, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: SRC_POINTS,
        type: 'circle',
        source: SRC_POINTS,
        paint: {
          'circle-radius': ['case', ['get', 'isDestination'], 7, 5],
          'circle-color': ['case', ['get', 'isDestination'], '#f2c14e', '#ffffff'],
          'circle-stroke-color': '#0b0c10',
          'circle-stroke-width': 2,
        },
      });
      map.addLayer({
        id: SRC_POINTS + '-label',
        type: 'symbol',
        source: SRC_POINTS,
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
        },
        paint: { 'text-color': '#ffffff', 'text-halo-color': '#000000', 'text-halo-width': 1 },
      });
    }
  }

  function render() {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    ensureLayers(map);

    const lineFeatures = Object.values(route.segments).map((seg) => {
      const branch = route.branches.find((b) => b.segmentIds.includes(seg.id));
      return {
        type: 'Feature' as const,
        properties: { color: branch?.color ?? '#f5f1e6', uncertain: seg.uncertain },
        geometry: { type: 'LineString' as const, coordinates: seg.coordinates },
      };
    });
    (map.getSource(SRC_LINES) as any)?.setData({ type: 'FeatureCollection', features: lineFeatures });

    const pointFeatures = Object.values(route.waypoints).map((wp) => ({
      type: 'Feature' as const,
      properties: { label: wp.customLabel || wp.name, isDestination: wp.isDestination },
      geometry: { type: 'Point' as const, coordinates: [wp.lng, wp.lat] },
    }));
    (map.getSource(SRC_POINTS) as any)?.setData({ type: 'FeatureCollection', features: pointFeatures });
  }

  useEffect(render, [route]);

  async function appendWaypoint(wpInput: Omit<Waypoint, 'id'>, routeIt: boolean) {
    const branchId = activeBranch.id;
    const prevLastId = activeBranch.waypointIds[activeBranch.waypointIds.length - 1];
    const newId = addWaypoint(branchId, wpInput);

    if (routeIt && prevLastId) {
      setBusy('Finding road route…');
      const from = route.waypoints[prevLastId] ?? wpInput; // best effort
      const fromLL: [number, number] = [from.lng, from.lat];
      const toLL: [number, number] = [wpInput.lng, wpInput.lat];
      const result = await fetchRoadRoute(fromLL, toLL);
      setRoute((prev) => {
        const branch = prev.branches.find((b) => b.id === branchId);
        const segId = branch?.segmentIds[branch.segmentIds.length - 1];
        if (!segId || !prev.segments[segId]) return prev;
        return {
          ...prev,
          segments: {
            ...prev.segments,
            [segId]: { ...prev.segments[segId], coordinates: result.coordinates, distanceKm: result.distanceKm, uncertain: result.uncertain },
          },
        };
      });
      setBusy(null);
    } else if (prevLastId) {
      // manual draw: mark the stub segment as an intentional user-drawn line, not "unconfirmed road data"
      setRoute((prev) => {
        const branch = prev.branches.find((b) => b.id === branchId);
        const segId = branch?.segmentIds[branch.segmentIds.length - 1];
        if (!segId || !prev.segments[segId]) return prev;
        return {
          ...prev,
          segments: { ...prev.segments, [segId]: { ...prev.segments[segId], mode: 'manual', uncertain: false } },
        };
      });
    }

    // best-effort elevation lookup if not provided
    if (wpInput.elevationM === undefined) {
      fetchElevations([{ lat: wpInput.lat, lng: wpInput.lng }]).then(([ele]) => {
        if (!isNaN(ele)) updateElevation(newId, ele);
      });
    }
  }

  function updateElevation(id: string, ele: number) {
    store.updateWaypoint(id, { elevationM: ele });
  }

  function handleSearch(q: string) {
    setQuery(q);
    setSearchError(null);

    if (searchDebounceRef.current) window.clearTimeout(searchDebounceRef.current);
    searchAbortRef.current?.abort();

    if (q.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    // Debounce + cancel any in-flight request: Nominatim's public server is
    // aggressively rate-limited and firing a request per keystroke gets
    // most of them rejected with 429s.
    setSearching(true);
    searchDebounceRef.current = window.setTimeout(async () => {
      const controller = new AbortController();
      searchAbortRef.current = controller;
      try {
        const r = await searchPlace(q, controller.signal);
        setResults(r);
        if (r.length === 0) setSearchError('No matches found.');
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setResults([]);
        setSearchError(err instanceof Error ? err.message : 'Search failed.');
      } finally {
        setSearching(false);
      }
    }, 450);
  }

  function pickSearchResult(r: GeocodeResult) {
    appendWaypoint(
      {
        name: r.name.split(',')[0],
        lat: r.lat,
        lng: r.lng,
        showLabel: true,
        isDestination: false,
        includeInOverlay: true,
        source: 'search',
      },
      true
    );
    setResults([]);
    setQuery('');
  }

  function handleMapClick(lng: number, lat: number) {
    if (clickMode === 'off') return;
    appendWaypoint(
      {
        name: `Point ${activeBranch.waypointIds.length + 1}`,
        lat,
        lng,
        showLabel: true,
        isDestination: false,
        includeInOverlay: true,
        source: 'click',
      },
      clickMode === 'road'
    );
  }

  async function handleGpxFile(file: File) {
    setBusy('Importing GPX…');
    try {
      const text = await file.text();
      const parsed = parseGpx(text);
      const branchName = file.name.replace(/\.gpx$/i, '');
      const branchId = addBranch(branchName);

      setRoute((prev) => {
        const waypoints = { ...prev.waypoints };
        const waypointIds: string[] = [];

        if (parsed.trackPoints.length > 0) {
          const startId = uid();
          const endId = uid();
          const [slng, slat] = parsed.trackPoints[0];
          const [elng, elat] = parsed.trackPoints[parsed.trackPoints.length - 1];
          waypoints[startId] = { id: startId, name: `${branchName} start`, lat: slat, lng: slng, showLabel: true, isDestination: false, includeInOverlay: true, source: 'gpx' };
          waypoints[endId] = { id: endId, name: `${branchName} end`, lat: elat, lng: elng, showLabel: true, isDestination: true, includeInOverlay: true, source: 'gpx' };
          waypointIds.push(startId, endId);

          for (const wp of parsed.waypoints) {
            const id = uid();
            waypoints[id] = { id, name: wp.name, lat: wp.lat, lng: wp.lng, elevationM: wp.ele, showLabel: true, isDestination: false, includeInOverlay: true, source: 'gpx' };
            waypointIds.splice(1, 0, id); // insert between start/end for display order
          }

          const segId = uid();
          const segments = {
            ...prev.segments,
            [segId]: { id: segId, fromWaypointId: startId, toWaypointId: endId, mode: 'gpx' as const, coordinates: parsed.trackPoints, uncertain: false },
          };
          const branches = prev.branches.map((b) => (b.id === branchId ? { ...b, waypointIds, segmentIds: [segId] } : b));
          return { ...prev, waypoints, segments, branches, updatedAt: new Date().toISOString() };
        } else {
          // waypoint-only GPX: chain them with straight (unconfirmed) segments
          for (const wp of parsed.waypoints) {
            const id = uid();
            waypoints[id] = { id, name: wp.name, lat: wp.lat, lng: wp.lng, elevationM: wp.ele, showLabel: true, isDestination: false, includeInOverlay: true, source: 'gpx' };
            waypointIds.push(id);
          }
          const segments = { ...prev.segments };
          const segIds: string[] = [];
          for (let i = 1; i < waypointIds.length; i++) {
            const a = waypoints[waypointIds[i - 1]];
            const b = waypoints[waypointIds[i]];
            const sid = uid();
            segIds.push(sid);
            segments[sid] = { id: sid, fromWaypointId: waypointIds[i - 1], toWaypointId: waypointIds[i], mode: 'road', coordinates: [[a.lng, a.lat], [b.lng, b.lat]], uncertain: true };
          }
          const branches = prev.branches.map((b) => (b.id === branchId ? { ...b, waypointIds, segmentIds: segIds } : b));
          return { ...prev, waypoints, segments, branches, updatedAt: new Date().toISOString() };
        }
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to import GPX file');
    } finally {
      setBusy(null);
    }
  }

  async function loadDemo() {
    setBusy('Loading demo route (resolving real road geometry)…');
    const demo = buildDemoRoute();
    setRoute(demo);
    setActiveBranchId(demo.branches[0].id);
    const resolved = await resolveRouteRoadSegments(demo, (done, total) => setBusy(`Resolving road routes ${done}/${total}…`));
    setRoute(resolved);
    setBusy(null);
  }

  function saveRoute() {
    import('../lib/storage').then(({ saveRoute }) => {
      saveRoute(route);
      alert('Route saved locally.');
    });
  }

  return (
    <div className="flex flex-1 min-h-0">
      <aside className="w-[340px] flex flex-col border-r border-white/10 bg-[#0e0f14] min-h-0">
      <div className="flex-1 overflow-y-auto thin-scroll p-4 flex flex-col gap-4 min-h-0">
        <div>
          <label className="text-xs uppercase tracking-wider text-white/40">Search a location</label>
          <input
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results.length > 0) pickSearchResult(results[0]);
              if (e.key === 'Escape') {
                setQuery('');
                setResults([]);
              }
            }}
            placeholder="e.g. Darcha, Himachal Pradesh"
            className="mt-1 w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:border-white/30"
          />
          {searching && <div className="text-xs text-white/30 mt-1">Searching…</div>}
          {!searching && searchError && <div className="text-xs text-amber-300/80 mt-1">{searchError}</div>}
          {results.length > 0 && (
            <ul className="mt-1 border border-white/10 rounded-md overflow-hidden">
              {results.map((r, i) => (
                <li
                  key={i}
                  onClick={() => pickSearchResult(r)}
                  className="px-3 py-2 text-xs hover:bg-white/10 cursor-pointer truncate border-b border-white/5 last:border-0"
                >
                  {r.name}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider text-white/40">Map click adds…</label>
          <div className="mt-1 flex gap-1">
            {(['road', 'manual', 'off'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setClickMode(m)}
                className={`flex-1 text-xs py-1.5 rounded-md border ${
                  clickMode === m ? 'bg-white text-black border-white' : 'border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                {m === 'road' ? 'Road route' : m === 'manual' ? 'Manual draw' : 'Off'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs uppercase tracking-wider text-white/40">Branches</label>
            <button
              onClick={() => {
                const name = prompt('Branch name?', `Branch ${route.branches.length + 1}`);
                if (name) addBranch(name, activeBranch.waypointIds[activeBranch.waypointIds.length - 1]);
              }}
              className="text-xs text-white/50 hover:text-white"
            >
              + New
            </button>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {route.branches.map((b) => (
              <button
                key={b.id}
                onClick={() => setActiveBranchId(b.id)}
                className={`text-xs px-2.5 py-1 rounded-full border ${
                  b.id === activeBranchId ? 'bg-white text-black border-white' : 'border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>

        {stats.pointCount > 1 && (
          <div className="flex items-center justify-between text-xs text-white/50 bg-white/[0.03] border border-white/10 rounded-md px-2.5 py-2">
            <span>{(stats.distanceKm * 0.621371).toFixed(1)} mi</span>
            <span className="text-white/20">·</span>
            <span title="Elevation gain">↑{Math.round(metersToFeet(stats.gainM)).toLocaleString()} ft</span>
            <span className="text-white/20">·</span>
            <span title="Elevation loss">↓{Math.round(metersToFeet(stats.lossM)).toLocaleString()} ft</span>
            {stats.hasUncertainSegment && (
              <span className="text-amber-300/70" title="Part of this route couldn't be confidently road-routed">⚠</span>
            )}
          </div>
        )}

        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs uppercase tracking-wider text-white/40">
              Waypoints — {activeBranch.name}
            </label>
            {activeBranch.waypointIds.length > 0 && (
              <button
                onClick={() => removeWaypoint(activeBranch.id, activeBranch.waypointIds[activeBranch.waypointIds.length - 1])}
                className="text-xs text-white/50 hover:text-white"
                title="Remove the last waypoint added to this branch"
              >
                ↩ Undo last
              </button>
            )}
          </div>
          <div className="mt-1">
            <WaypointList
              route={route}
              branch={activeBranch}
              onReorder={(f, t) => reorderWaypoint(activeBranch.id, f, t)}
              onRemove={(wid) => removeWaypoint(activeBranch.id, wid)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
          <input
            ref={fileInputRef}
            type="file"
            accept=".gpx"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleGpxFile(e.target.files[0])}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-sm py-2 rounded-md border border-white/15 hover:bg-white/10"
          >
            Import GPX track
          </button>
          <button onClick={loadDemo} className="text-sm py-2 rounded-md border border-white/15 hover:bg-white/10">
            Load demo route (Manali · Spiti · Zanskar)
          </button>
          <button onClick={saveRoute} className="text-sm py-2 rounded-md border border-white/15 hover:bg-white/10">
            Save route
          </button>
          {busy && <div className="text-xs text-amber-300/80 text-center">{busy}</div>}
        </div>
      </div>

      {/* Fixed footer — always visible, never scrolls out of view */}
      <div className="shrink-0 p-4 pt-3 border-t border-white/10 bg-[#0e0f14]">
        <button
          onClick={() => store.setStep(2)}
          disabled={Object.keys(route.waypoints).length === 0}
          className="w-full text-sm py-2.5 rounded-md bg-white text-black hover:bg-white/90 disabled:opacity-40 disabled:hover:bg-white font-medium"
        >
          Next: Route Editor →
        </button>
        {Object.keys(route.waypoints).length === 0 && (
          <div className="text-[11px] text-white/30 text-center mt-1.5">
            Add at least one waypoint (search, click the map, import a GPX, or load the demo) to continue.
          </div>
        )}
      </div>
      </aside>

      <div className="flex-1 relative">
        <MapView onMapReady={(m) => { mapRef.current = m; render(); }} onClick={handleMapClick} />
        <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur px-3 py-2 rounded-md text-[11px] text-white/70 max-w-[280px]">
          Dashed, faded lines mean the real road/track couldn't be confidently found — import a GPX track for exact geometry there.
        </div>
      </div>
    </div>
  );
}
