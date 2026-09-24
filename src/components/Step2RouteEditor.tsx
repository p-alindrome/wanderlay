import { useRouteStore } from '../store/RouteStore';
import { formatElevation, formatCoords, metersToFeet } from '../lib/geo';
import type { Waypoint } from '../types';

export default function Step2RouteEditor() {
  const { route, updateWaypoint, setStep } = useRouteStore();
  const allWaypoints = Object.values(route.waypoints);
  const destinationCount = allWaypoints.filter((w) => w.isDestination).length;

  function patch(wp: Waypoint, p: Partial<Waypoint>) {
    updateWaypoint(wp.id, p);
  }

  return (
    <div className="flex flex-1 min-h-0">
      {/* Same layout pattern as Create Route / Overlay Designer: scrollable
          content up top, nav buttons pinned in a fixed footer at the bottom
          of this sidebar — never a full-width bar at the bottom of the page. */}
      <aside className="w-[300px] flex flex-col border-r border-white/10 bg-[#0e0f14] min-h-0">
        <div className="flex-1 overflow-y-auto thin-scroll p-4 flex flex-col gap-4 min-h-0">
          <div>
            <label className="text-xs uppercase tracking-wider text-white/40">Route summary</label>
            <div className="mt-1 text-sm text-white/80">{route.name}</div>
            <div className="mt-1 text-xs text-white/40">
              {allWaypoints.length} waypoint{allWaypoints.length === 1 ? '' : 's'} · {destinationCount} destination
              {destinationCount === 1 ? '' : 's'}
            </div>
          </div>

          {route.branches.length > 1 && (
            <div>
              <label className="text-xs uppercase tracking-wider text-white/40">Branches</label>
              <ul className="mt-1 flex flex-col gap-1">
                {route.branches.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-md border border-white/10 bg-white/[0.03]"
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: b.color ?? '#f5f1e6' }} />
                      <span className="truncate">{b.name}</span>
                    </span>
                    <span className="text-white/30 shrink-0 ml-2">{b.waypointIds.length}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-[11px] text-white/30 pt-2 border-t border-white/10">
            Elevation shown in the table as {formatElevation(0, 'ft').split(' ').pop()}. Displayed elevations were
            looked up automatically where possible — override any value by typing over it.
          </div>
        </div>

        {/* Fixed footer — always visible, never scrolls out of view */}
        <div className="shrink-0 p-4 pt-3 border-t border-white/10 bg-[#0e0f14] flex flex-col gap-2">
          <button onClick={() => setStep(1)} className="text-sm py-2 rounded-md border border-white/15 hover:bg-white/10">
            ← Back to Create Route
          </button>
          <button
            onClick={() => setStep(3)}
            disabled={allWaypoints.length === 0}
            className="text-sm py-2.5 rounded-md bg-white text-black hover:bg-white/90 disabled:opacity-40 disabled:hover:bg-white font-medium"
          >
            Next: Overlay Designer →
          </button>
        </div>
      </aside>

      <div className="flex-1 overflow-y-auto thin-scroll p-6 min-h-0">
        <h1 className="text-xl font-medium mb-1">Route Editor</h1>
        <p className="text-sm text-white/50 mb-6">
          Fine-tune each waypoint — its label, elevation, destination status, and whether it appears on the final overlay.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-y-1">
            <thead>
              <tr className="text-left text-white/40 text-xs uppercase tracking-wider">
                <th className="px-2 py-1">Name</th>
                <th className="px-2 py-1">Custom label</th>
                <th className="px-2 py-1">Lat</th>
                <th className="px-2 py-1">Lng</th>
                <th className="px-2 py-1">Elevation</th>
                <th className="px-2 py-1 text-center">Destination</th>
                <th className="px-2 py-1 text-center">Show label</th>
                <th className="px-2 py-1 text-center">In overlay</th>
              </tr>
            </thead>
            <tbody>
              {allWaypoints.map((wp) => (
                <tr key={wp.id} className="bg-white/[0.03] hover:bg-white/[0.06]">
                  <td className="px-2 py-2 rounded-l-md">
                    <input
                      value={wp.name}
                      onChange={(e) => patch(wp, { name: e.target.value })}
                      className="bg-transparent border-b border-white/10 focus:border-white/40 outline-none w-32"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={wp.customLabel ?? ''}
                      placeholder="optional"
                      onChange={(e) => patch(wp, { customLabel: e.target.value })}
                      className="bg-transparent border-b border-white/10 focus:border-white/40 outline-none w-28 placeholder:text-white/20"
                    />
                  </td>
                  <td className="px-2 py-2 text-white/60 font-mono text-xs">{wp.lat.toFixed(4)}</td>
                  <td className="px-2 py-2 text-white/60 font-mono text-xs">{wp.lng.toFixed(4)}</td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      value={wp.elevationM !== undefined ? Math.round(metersToFeet(wp.elevationM)) : ''}
                      placeholder="ft"
                      onChange={(e) =>
                        patch(wp, { elevationM: e.target.value ? parseFloat(e.target.value) / 3.28084 : undefined })
                      }
                      className="bg-transparent border-b border-white/10 focus:border-white/40 outline-none w-20 placeholder:text-white/20"
                    />
                    <span className="text-white/30 text-xs ml-1">ft</span>
                    <div className="text-[10px] text-white/30">{formatCoords(wp.lat, wp.lng)}</div>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={wp.isDestination}
                      onChange={(e) => patch(wp, { isDestination: e.target.checked })}
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={wp.showLabel}
                      onChange={(e) => patch(wp, { showLabel: e.target.checked })}
                    />
                  </td>
                  <td className="px-2 py-2 text-center rounded-r-md">
                    <input
                      type="checkbox"
                      checked={wp.includeInOverlay}
                      onChange={(e) => patch(wp, { includeInOverlay: e.target.checked })}
                    />
                  </td>
                </tr>
              ))}
              {allWaypoints.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-white/30 py-8">
                    No waypoints yet — go back to Create Route.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
