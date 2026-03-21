'use client';

import { useEffect, useRef, useState } from 'react';
import { decode as decodeGeohash, decodeBounds } from '@/lib/geohash';
import { locationLabel } from '@/lib/reverseGeo';
import type { Map as LeafletMap, CircleMarker } from 'leaflet';

interface GeoEvent {
  id: string;
  geohash: string;
  title?: string;
}

interface GeoSearchMapProps {
  geohash: string;
  resultCount?: number;
  events?: GeoEvent[];
  onEventClick?: (eventId: string) => void;
}

/**
 * Minimalist dark map showing the geohash search area with event markers.
 * Interactive: zoom + pan enabled. Markers for geo-tagged results.
 */
export default function GeoSearchMap({ geohash, resultCount, events, onEventClick }: GeoSearchMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<CircleMarker[]>([]);
  const [ready, setReady] = useState(false);
  const lRef = useRef<typeof import('leaflet') | null>(null);

  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;

    let cancelled = false;

    import('leaflet').then((L) => {
      if (cancelled || !mapRef.current) return;
      lRef.current = L;

      const bounds = decodeBounds(geohash);
      const center: [number, number] = [
        (bounds.lat.min + bounds.lat.max) / 2,
        (bounds.lon.min + bounds.lon.max) / 2,
      ];

      const map = L.map(mapRef.current, {
        center,
        zoom: geohashZoom(geohash),
        zoomControl: false,
        attributionControl: false,
        // Interactive: zoom + pan, but no keyboard/box shortcuts
        dragging: true,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        touchZoom: true,
        boxZoom: false,
        keyboard: false,
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
      }).addTo(map);

      // Draw the geohash bounding box
      L.rectangle(
        [[bounds.lat.min, bounds.lon.min], [bounds.lat.max, bounds.lon.max]],
        {
          color: '#60a5fa',
          weight: 2,
          opacity: 0.8,
          fillColor: '#3b82f6',
          fillOpacity: 0.15,
          dashArray: '6 4',
        }
      ).addTo(map);

      leafletMapRef.current = map;
      setReady(true);
    });

    return () => {
      cancelled = true;
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, [geohash]);

  // Update view when geohash changes
  useEffect(() => {
    if (!leafletMapRef.current || !ready) return;
    const bounds = decodeBounds(geohash);
    const center: [number, number] = [
      (bounds.lat.min + bounds.lat.max) / 2,
      (bounds.lon.min + bounds.lon.max) / 2,
    ];
    leafletMapRef.current.setView(center, geohashZoom(geohash));
  }, [geohash, ready]);

  // Plot event markers
  useEffect(() => {
    if (!leafletMapRef.current || !ready || !lRef.current) return;
    const L = lRef.current;
    const map = leafletMapRef.current;

    // Clear old markers
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];

    if (!events?.length) return;

    for (const evt of events) {
      const { lat, lon } = decodeGeohash(evt.geohash);
      const marker = L.circleMarker([lat, lon], {
        radius: 6,
        color: '#f59e0b',      // amber-500
        weight: 1.5,
        fillColor: '#f59e0b',
        fillOpacity: 0.7,
      }).addTo(map);

      if (evt.title) {
        marker.bindTooltip(evt.title, {
          direction: 'top',
          className: 'geo-marker-tooltip',
          offset: [0, -8],
        });
      }

      if (onEventClick) {
        marker.on('click', () => onEventClick(evt.id));
      }

      markersRef.current.push(marker);
    }
  }, [events, ready, onEventClick]);

  const bounds = decodeBounds(geohash);
  const centerLat = (bounds.lat.min + bounds.lat.max) / 2;
  const centerLon = (bounds.lon.min + bounds.lon.max) / 2;
  const city = locationLabel(centerLat, centerLon);

  return (
    <div className="mt-2 rounded-lg overflow-hidden border border-[#3d3d3d] relative" style={{ height: '200px' }}>
      <div ref={mapRef} className="w-full h-full" style={{ filter: 'invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9)' }} />
      {/* Overlay label */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-1.5 pointer-events-none z-[1000]">
        <div className="text-xs text-gray-300 flex items-center justify-between">
          <span>
            {city && <span className="text-gray-200">{city}</span>}
            {city && <span className="text-gray-500 mx-1">·</span>}
            <span className="text-gray-500 font-mono">g:{geohash}</span>
          </span>
          {resultCount !== undefined && resultCount > 0 && (
            <span className="text-gray-500">{resultCount} result{resultCount !== 1 ? 's' : ''}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function geohashZoom(hash: string): number {
  if (hash.length <= 1) return 2;
  if (hash.length <= 2) return 4;
  if (hash.length <= 3) return 6;
  if (hash.length <= 4) return 9;
  if (hash.length <= 5) return 11;
  return 13;
}
