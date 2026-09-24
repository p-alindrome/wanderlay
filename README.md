# Wanderlay

Create beautiful, minimalist GPS/map overlays for travel photos — transparent PNG/SVG route lines, markers, and typography you can drop straight into Canva, Photoshop, or Instagram.

This is the v1 scope: **React + TypeScript + Vite + MapLibre GL JS + OpenStreetMap + GPX import + SVG/PNG export**, per the "keep it small first" direction. The photo-underlay tool is a basic first pass; deeper photo editing, EXIF auto-routing, Strava, etc. are future work (see below).

## Run it

```bash
npm install
npm run dev
```

Open the printed local URL (typically `http://localhost:5173`). This is a normal client-side app — it needs real internet access in your browser to reach:

- **Map tiles**: [OpenFreeMap](https://openfreemap.org) (no API key)
- **Search**: OpenStreetMap Nominatim
- **Road routing**: the public OSRM demo server (`router.project-osrm.org`)
- **Elevation lookup**: Open-Elevation

None of these need API keys, but the public demo servers are rate-limited and not meant for heavy production traffic — swap in your own MapTiler/Mapbox/OSRM/Mapbox Elevation endpoint in `src/lib/*.ts` if you outgrow them.

`npm run build` produces a static `dist/` you can deploy anywhere (Vercel, Netlify, S3, etc.) — there's no backend.

## The 3-step workflow

1. **Create Route** — search a place, click the map to drop waypoints, drag to reorder, import a `.gpx` track, or load the preloaded demo route. Consecutive waypoints are auto-connected with a **real road route from OSRM**, not a straight line. When OSRM can't confidently resolve a road (common for high-altitude jeep tracks that aren't mapped as driveable ways in OSM), the segment is drawn dashed/faded and flagged as *unconfirmed* rather than silently presented as fact — import a GPX track of the actual drive for exact geometry there.
2. **Route Editor** — table view of every waypoint: name, custom label, lat/lng, elevation (auto-looked-up, editable), destination flag, per-waypoint label visibility, and whether it appears on the final overlay at all.
3. **Overlay Designer** — style the route (thickness/opacity/dash/color/glow/arrows), markers (dot/circle/pin/custom), typography (Inter/Helvetica/Montserrat/DM Sans, size, letter-spacing, opacity, alignment), and text fields (name, elevation, coordinates, distance, date, custom). Six presets are included: **Himalayan Minimal** (default), Minimal, Expedition, Cinematic, GPS, Postcard. Three map modes: Route Only (transparent, default), Faint Map, Full Map. Upload a photo (HEIC from an iPhone is auto-converted to JPEG) and drag/scale/rotate/fade it under the overlay to line things up. The route/marker/label graphic itself can also be moved and resized independently under **"Overlay position & size"** — shrink it and place it like a sticker in a corner of the photo instead of always filling the whole frame. By default the photo stays preview-only and the export is the transparent overlay alone, matching the "place it yourself in Canva/Photoshop" workflow — flip **"Include photo in export"** if you'd rather download the flattened composite (photo + overlay baked into one PNG/SVG) directly.

Export as a transparent PNG (2x, true alpha) or standalone SVG, sized to Instagram Portrait (1080×1350), Instagram Story (1080×1920), Square (1080×1080), or a custom size.

## The demo route

Preloaded on request ("Load demo route" in Step 1) as four self-contained, independently-toggleable routes, all starting from Manali (via Atal Tunnel, Sissu, Tandi, Keylong, Jispa, Darcha):

- **Manali → Baralacha La** (~16,040 ft)
- **Manali → Shinkula Top** (~16,700 ft)
- **Manali → Gonbo Rangjon** (~18,100 ft, via Shinkula Top and Zanskar)
- **Manali → Chandratal** (~14,100 ft, via Atal Tunnel, Koksar, Chatru, Batal)

**Kunzum Pass is intentionally not included.** The shared stretches between these (e.g. Manali → Darcha, or Darcha → Shinkula Top) are stored once and reused across every route that passes through them — not duplicated — so resolving real road geometry and toggling a route's visibility in Step 3 both work correctly without needing a separate "trunk" branch. Coordinates and elevations for the well-documented points (Manali, Atal Tunnel, Sissu, Tandi, Keylong, Jispa, Darcha, Baralacha La, Shinku La, Gonbo Rangjon, Koksar, Chandratal) come from surveyed/cited sources; Chatru/Batal only have approximate, commonly-cited coordinates and are labeled "(approx.)" — the app still resolves real road/track geometry between all of them at load time rather than trusting any of these points blindly.

## Architecture notes for what's next

The data model (`src/types.ts`) and lib layer were kept deliberately generic so these slot in without a rewrite:

- **GPX import** — done (`src/lib/gpx.ts`).
- **EXIF GPS extraction** — add a `src/lib/exif.ts` (e.g. `exifr`) that reads a photo's GPS tags and feeds them into the same `searchPlace`/waypoint pipeline Step 1 already uses; this is the "upload a photo → auto-generate the overlay" feature.
- **Strava / Google Photos / Apple Photos** — new adapters in `src/lib/`, each producing the same `ParsedGpx`-shaped track data GPX import already produces.
- **Automatic distance/elevation** — already wired (`lib/geo.ts#waypointDistanceFromBranchStart`, `lib/elevation.ts`); just needs a caching layer if usage grows.
- **Multiple routes on one photo, animated reveal, video export** — `OverlayCanvas.tsx` renders one route's SVG; multi-route support is mostly a matter of rendering N `<g>` groups and video export means driving the same SVG through a timeline (e.g. with a Canvas `requestAnimationFrame` loop + `MediaRecorder`).
- **Saved trips / shareable pages / public-private** — `src/lib/storage.ts` currently persists to `localStorage`; swap it for a real backend (Supabase/Postgres) behind the same `listSavedRoutes/saveRoute/deleteRoute` interface and nothing else needs to change.

## Known limitations (v1)

- Road routing depends on the public OSRM demo instance, which has patchy coverage of unpaved Himalayan tracks — that's why the "uncertain" flag and GPX import exist.
- Photo mode has no true crop tool yet — it's drag/scale/rotate/opacity only, meant to help you line things up (or, with "Include photo in export" on, produce the final composite) rather than being a full photo editor.
- The custom marker shape is a simple diamond placeholder — there's no upload-your-own-icon flow yet.
