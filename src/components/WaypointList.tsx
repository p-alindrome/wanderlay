import { useState } from 'react';
import type { RouteBranch, RouteData } from '../types';
import { formatElevation } from '../lib/geo';

interface Props {
  route: RouteData;
  branch: RouteBranch;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onRemove: (waypointId: string) => void;
  onSelect?: (waypointId: string) => void;
  selectedId?: string;
}

export default function WaypointList({ route, branch, onReorder, onRemove, onSelect, selectedId }: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  return (
    <ul className="flex flex-col gap-1 thin-scroll overflow-y-auto max-h-[38vh]">
      {branch.waypointIds.map((wid, i) => {
        const wp = route.waypoints[wid];
        if (!wp) return null;
        return (
          <li
            key={wid}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIndex !== null && dragIndex !== i) onReorder(dragIndex, i);
              setDragIndex(null);
            }}
            onClick={() => onSelect?.(wid)}
            className={`group flex items-center gap-2 px-2.5 py-2 rounded-md border text-sm cursor-grab active:cursor-grabbing ${
              selectedId === wid ? 'border-white/50 bg-white/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
            }`}
          >
            <span className="text-white/30 text-xs w-4">{i + 1}</span>
            <span className={`w-2 h-2 rounded-full ${wp.isDestination ? 'bg-amber-400' : 'bg-white/50'}`} />
            <div className="flex-1 min-w-0">
              <div className="truncate">{wp.customLabel || wp.name}</div>
              {wp.elevationM !== undefined && (
                <div className="text-[11px] text-white/40">{formatElevation(wp.elevationM, 'ft')}</div>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(wid);
              }}
              className="opacity-0 group-hover:opacity-100 text-white/40 hover:text-red-400 text-xs px-1"
              title="Remove"
            >
              ✕
            </button>
          </li>
        );
      })}
      {branch.waypointIds.length === 0 && (
        <li className="text-white/30 text-sm px-2.5 py-4 text-center border border-dashed border-white/10 rounded-md">
          No waypoints yet. Search a place or click the map.
        </li>
      )}
    </ul>
  );
}
