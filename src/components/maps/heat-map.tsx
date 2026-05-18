'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import type { GeoPoint } from '@/types/analytics';
import { Skeleton } from '@/components/ui/skeleton';

const HeatMapInner = dynamic(() => import('./heat-map-inner'), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

export function HeatMap({
  points,
  height = 480,
  className,
}: {
  points: GeoPoint[];
  height?: number;
  className?: string;
}) {
  return (
    <div className={className} style={{ height }}>
      <HeatMapInner points={points} />
    </div>
  );
}
