import type { StyleSpecification } from 'maplibre-gl';

/**
 * Plain raster basemap from the official OpenStreetMap tile server. No API
 * key, no account, no separate style.json/sprite/glyph fetches — just PNG
 * tiles from tile.openstreetmap.org, the most universally-reachable free
 * tile source there is. (CARTO's raster tiles now require a free API key
 * for anything beyond their own demo pages, which is why they showed an
 * "API KEY REQUIRED" watermark here — that wasn't a network block.)
 *
 * OSM's tile server asks for reasonable/non-bulk use — fine for this app's
 * traffic, but if you outgrow it or want a nicer look, swap in MapTiler or
 * Mapbox (both offer a free tier with an API key) right here.
 */
export const BASEMAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    basemap: {
      type: 'raster',
      tiles: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
      maxzoom: 19,
    },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#e9e6dd' } },
    { id: 'basemap', type: 'raster', source: 'basemap' },
  ],
};
