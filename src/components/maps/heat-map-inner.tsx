'use client';

import * as React from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import type { GeoPoint } from '@/types/analytics';

interface Props {
  points: GeoPoint[];
}

export default function HeatMapInner({ points }: Props) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<L.Map | null>(null);

  React.useEffect(() => {
    if (!ref.current) return;
    if (mapRef.current) return;

    const map = L.map(ref.current, {
      center: [-23.55, -46.63],
      zoom: 10,
      zoomControl: true,
      attributionControl: false,
    });
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    L.control
      .attribution({ position: 'bottomright', prefix: false })
      .addAttribution('© OpenStreetMap')
      .addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!points.length) return;

    const heatPoints = points.map(
      (p) => [p.lat, p.lon, Math.min(1, p.weight / 10)] as [number, number, number]
    );

    const layer = (L as unknown as { heatLayer: (pts: unknown, opts: unknown) => L.Layer })
      .heatLayer(heatPoints, {
        radius: 22,
        blur: 18,
        maxZoom: 14,
        gradient: {
          0.2: '#22d3ee',
          0.4: '#3b82f6',
          0.6: '#8b5cf6',
          0.8: '#f59e0b',
          1.0: '#ef4444',
        },
      })
      .addTo(map);

    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lon]));
    if (bounds.isValid()) map.fitBounds(bounds.pad(0.1));

    return () => {
      map.removeLayer(layer);
    };
  }, [points]);

  return <div ref={ref} className="h-full w-full rounded-lg overflow-hidden" />;
}
