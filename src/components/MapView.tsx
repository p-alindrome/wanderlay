import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MLMap, MapMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { BASEMAP_STYLE } from '../lib/mapStyle';

interface MapViewProps {
  onMapReady?: (map: MLMap) => void;
  onClick?: (lng: number, lat: number) => void;
  center?: [number, number];
  zoom?: number;
  className?: string;
}

export default function MapView({ onMapReady, onClick, center, zoom, className }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      center: center ?? [77.25, 32.5],
      zoom: zoom ?? 8,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.on('click', (e: MapMouseEvent) => onClickRef.current?.(e.lngLat.lng, e.lngLat.lat));
    map.on('load', () => onMapReady?.(map));
    // A failed tile/source request surfaces here rather than as a silent
    // blank map — most commonly a network/proxy blocking the tile host, or
    // (as happened once already) a provider starting to require an API
    // key. See src/lib/mapStyle.ts for how to swap providers. A single
    // dropped tile request isn't worth alarming over, so only show the
    // banner once errors keep piling up with nothing successfully
    // rendering — and clear it as soon as the map goes idle (finished
    // loading) with tiles actually on screen.
    let errorCount = 0;
    map.on('error', (e) => {
      console.error('Map tile error:', e.error);
      errorCount++;
      if (errorCount >= 3) setTileError(true);
    });
    map.on('idle', () => {
      errorCount = 0;
      setTileError(false);
    });
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={className ?? 'w-full h-full relative'}>
      <div ref={containerRef} className="w-full h-full" />
      {tileError && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-red-950/90 border border-red-500/40 text-red-200 text-xs px-3 py-2 rounded-md max-w-md text-center">
          Map tiles are having trouble loading. Open DevTools → Network and look for
          failing requests to the tile host configured in <code>src/lib/mapStyle.ts</code>
          — that'll tell you whether it's a network/proxy block or something else.
          Waypoints, routing, and export still work without the basemap.
        </div>
      )}
    </div>
  );
}
