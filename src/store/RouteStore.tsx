import { createContext, useContext, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type {
  RouteData,
  Waypoint,
  RouteSegment,
  OverlayStyle,
  PhotoState,
  OverlayTransform,
} from '../types';
import { uid } from '../lib/geo';
import { PRESETS, DEFAULT_PRESET_ID, DEFAULT_EXPORT_PRESET_ID } from '../lib/presets';

function emptyRoute(): RouteData {
  const now = new Date().toISOString();
  const branchId = uid();
  return {
    id: uid(),
    name: 'Untitled Route',
    waypoints: {},
    segments: {},
    branches: [{ id: branchId, name: 'Main Route', waypointIds: [], segmentIds: [] }],
    createdAt: now,
    updatedAt: now,
  };
}

const BRANCH_COLORS = ['#f5f1e6', '#f2c14e', '#7fb8f0', '#e08a8a', '#9be07f', '#c9a0f5'];

interface Store {
  step: 1 | 2 | 3;
  setStep: (s: 1 | 2 | 3) => void;

  route: RouteData;
  setRoute: Dispatch<SetStateAction<RouteData>>;
  activeBranchId: string;
  setActiveBranchId: (id: string) => void;

  addWaypoint: (branchId: string, wp: Omit<Waypoint, 'id'>, atIndex?: number) => string;
  updateWaypoint: (id: string, patch: Partial<Waypoint>) => void;
  removeWaypoint: (branchId: string, waypointId: string) => void;
  reorderWaypoint: (branchId: string, fromIndex: number, toIndex: number) => void;

  addBranch: (name: string, forkFromWaypointId?: string) => string;
  setSegment: (branchId: string, seg: RouteSegment) => void;
  rebuildSegmentsForBranch: (branchId: string) => void;
  setBranchVisible: (branchId: string, visible: boolean) => void;

  drawMode: 'off' | 'manual';
  setDrawMode: (m: 'off' | 'manual') => void;

  overlayStyle: OverlayStyle;
  setOverlayStyle: (s: OverlayStyle) => void;
  applyPreset: (presetId: string) => void;

  exportPresetId: string;
  setExportPresetId: (id: string) => void;
  customSize: { width: number; height: number };
  setCustomSize: (w: number, h: number) => void;

  photo: PhotoState;
  setPhoto: (p: PhotoState) => void;

  /** position/scale of the route+markers+labels graphic itself, independent
   *  of the photo underneath — lets it be shrunk and placed like a sticker
   *  anywhere on the photo rather than always filling the whole canvas. */
  overlayTransform: OverlayTransform;
  setOverlayTransform: (t: OverlayTransform) => void;
}

const RouteContext = createContext<Store | null>(null);

export function RouteProvider({ children }: { children: ReactNode }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [route, setRoute] = useState<RouteData>(emptyRoute());
  const [activeBranchId, setActiveBranchId] = useState<string>(route.branches[0].id);
  const [drawMode, setDrawMode] = useState<'off' | 'manual'>('off');
  const [overlayStyle, setOverlayStyle] = useState<OverlayStyle>(PRESETS[DEFAULT_PRESET_ID]);
  const [exportPresetId, setExportPresetId] = useState(DEFAULT_EXPORT_PRESET_ID);
  const [customSize, setCustomSizeState] = useState({ width: 1080, height: 1350 });
  const [photo, setPhoto] = useState<PhotoState>({ offsetX: 0, offsetY: 0, scale: 1, rotationDeg: 0, opacity: 0.9 });
  const [overlayTransform, setOverlayTransform] = useState<OverlayTransform>({ offsetX: 0, offsetY: 0, scale: 1 });

  function touch(r: RouteData): RouteData {
    return { ...r, updatedAt: new Date().toISOString() };
  }

  function addWaypoint(branchId: string, wp: Omit<Waypoint, 'id'>, atIndex?: number): string {
    const id = uid();
    setRoute((prev) => {
      const waypoints = { ...prev.waypoints, [id]: { ...wp, id } };
      const branches = prev.branches.map((b) => {
        if (b.id !== branchId) return b;
        const ids = [...b.waypointIds];
        const insertAt = atIndex === undefined ? ids.length : atIndex;
        ids.splice(insertAt, 0, id);
        return { ...b, waypointIds: ids };
      });
      let next = touch({ ...prev, waypoints, branches });
      next = rebuildBranchSegments(next, branchId);
      return next;
    });
    return id;
  }

  function updateWaypoint(id: string, patch: Partial<Waypoint>) {
    setRoute((prev) => {
      if (!prev.waypoints[id]) return prev;
      return touch({ ...prev, waypoints: { ...prev.waypoints, [id]: { ...prev.waypoints[id], ...patch } } });
    });
  }

  function removeWaypoint(branchId: string, waypointId: string) {
    setRoute((prev) => {
      const branches = prev.branches.map((b) =>
        b.id === branchId ? { ...b, waypointIds: b.waypointIds.filter((w) => w !== waypointId) } : b
      );
      let next = touch({ ...prev, branches });
      next = rebuildBranchSegments(next, branchId);
      return next;
    });
  }

  function reorderWaypoint(branchId: string, fromIndex: number, toIndex: number) {
    setRoute((prev) => {
      const branches = prev.branches.map((b) => {
        if (b.id !== branchId) return b;
        const ids = [...b.waypointIds];
        const [moved] = ids.splice(fromIndex, 1);
        ids.splice(toIndex, 0, moved);
        return { ...b, waypointIds: ids };
      });
      let next = touch({ ...prev, branches });
      next = rebuildBranchSegments(next, branchId);
      return next;
    });
  }

  function addBranch(name: string, forkFromWaypointId?: string): string {
    const id = uid();
    setRoute((prev) => {
      const color = BRANCH_COLORS[prev.branches.length % BRANCH_COLORS.length];
      const waypointIds = forkFromWaypointId ? [forkFromWaypointId] : [];
      const branches = [...prev.branches, { id, name, waypointIds, segmentIds: [], color, visible: true }];
      return touch({ ...prev, branches });
    });
    setActiveBranchId(id);
    return id;
  }

  function setBranchVisible(branchId: string, visible: boolean) {
    setRoute((prev) =>
      touch({ ...prev, branches: prev.branches.map((b) => (b.id === branchId ? { ...b, visible } : b)) })
    );
  }

  function setSegment(branchId: string, seg: RouteSegment) {
    setRoute((prev) => {
      const segments = { ...prev.segments, [seg.id]: seg };
      const branches = prev.branches.map((b) =>
        b.id === branchId && !b.segmentIds.includes(seg.id)
          ? { ...b, segmentIds: [...b.segmentIds, seg.id] }
          : b
      );
      return touch({ ...prev, segments, branches });
    });
  }

  // Rebuild the segment list for a branch whenever its waypoint order
  // changes shape. Any consecutive (from,to) pair that already had a
  // resolved segment (real road geometry, GPX track, or manual line)
  // is REUSED as-is rather than reset to a straight-line stub — only
  // genuinely new adjacent pairs get a fresh unconfirmed stub for the
  // routing layer to resolve.
  function rebuildBranchSegments(r: RouteData, branchId: string): RouteData {
    const branch = r.branches.find((b) => b.id === branchId);
    if (!branch) return r;

    const existingByPair = new Map<string, RouteSegment>();
    for (const sid of branch.segmentIds) {
      const seg = r.segments[sid];
      if (seg) existingByPair.set(`${seg.fromWaypointId}>${seg.toWaypointId}`, seg);
    }

    const segments = { ...r.segments };
    for (const sid of branch.segmentIds) delete segments[sid];

    const segIds: string[] = [];
    for (let i = 1; i < branch.waypointIds.length; i++) {
      const from = branch.waypointIds[i - 1];
      const to = branch.waypointIds[i];
      const a = r.waypoints[from];
      const b = r.waypoints[to];
      if (!a || !b) continue;
      const reused = existingByPair.get(`${from}>${to}`);
      if (reused) {
        segIds.push(reused.id);
        segments[reused.id] = reused;
        continue;
      }
      const sid = uid();
      segIds.push(sid);
      segments[sid] = {
        id: sid,
        fromWaypointId: from,
        toWaypointId: to,
        mode: 'road',
        coordinates: [[a.lng, a.lat], [b.lng, b.lat]],
        uncertain: true,
      };
    }
    const branches = r.branches.map((b) => (b.id === branchId ? { ...b, segmentIds: segIds } : b));
    return { ...r, segments, branches };
  }

  function rebuildSegmentsForBranch(branchId: string) {
    setRoute((prev) => rebuildBranchSegments(prev, branchId));
  }

  function applyPreset(presetId: string) {
    const preset = PRESETS[presetId];
    if (preset) setOverlayStyle(preset);
  }

  function setCustomSize(width: number, height: number) {
    setCustomSizeState({ width, height });
  }

  const value: Store = useMemo(
    () => ({
      step,
      setStep,
      route,
      setRoute,
      activeBranchId,
      setActiveBranchId,
      addWaypoint,
      updateWaypoint,
      removeWaypoint,
      reorderWaypoint,
      addBranch,
      setSegment,
      rebuildSegmentsForBranch,
      setBranchVisible,
      drawMode,
      setDrawMode,
      overlayStyle,
      setOverlayStyle,
      applyPreset,
      exportPresetId,
      setExportPresetId,
      customSize,
      setCustomSize,
      photo,
      setPhoto,
      overlayTransform,
      setOverlayTransform,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step, route, activeBranchId, drawMode, overlayStyle, exportPresetId, customSize, photo, overlayTransform]
  );

  return <RouteContext.Provider value={value}>{children}</RouteContext.Provider>;
}

export function useRouteStore(): Store {
  const ctx = useContext(RouteContext);
  if (!ctx) throw new Error('useRouteStore must be used within RouteProvider');
  return ctx;
}
