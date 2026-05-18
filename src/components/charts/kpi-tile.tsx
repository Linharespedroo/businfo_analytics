'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn, fmtCompact, fmtDelta } from '@/lib/utils';

interface KpiTileProps {
  label: string;
  value: number | string;
  delta?: number;
  hint?: string;
  loading?: boolean;
  trend?: number[];
  emphasis?: 'primary' | 'success' | 'warn' | 'destructive';
}

export function KpiTile({
  label,
  value,
  delta,
  hint,
  loading,
  trend,
  emphasis,
}: KpiTileProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-end justify-between gap-3">
        <div>
          <div
            className={cn(
              'text-3xl font-semibold tabular-nums tracking-tight',
              loading && 'text-muted-foreground/50',
              emphasis === 'primary' && 'text-primary',
              emphasis === 'success' && 'text-emerald-500',
              emphasis === 'warn' && 'text-amber-500',
              emphasis === 'destructive' && 'text-destructive'
            )}
          >
            {loading ? '—' : typeof value === 'number' ? fmtCompact(value) : value}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            {delta != null && Number.isFinite(delta) ? (
              <DeltaPill value={delta} />
            ) : null}
            {hint && <span>{hint}</span>}
          </div>
        </div>
        {trend && trend.length > 1 && (
          <Spark trend={trend} positive={(delta ?? 0) >= 0} />
        )}
      </CardContent>
    </Card>
  );
}

function DeltaPill({ value }: { value: number }) {
  const up = value > 0.001;
  const down = value < -0.001;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[11px] font-medium',
        up && 'bg-emerald-500/10 text-emerald-500',
        down && 'bg-destructive/10 text-destructive',
        !up && !down && 'bg-muted text-muted-foreground'
      )}
    >
      {up ? <ArrowUp className="h-3 w-3" /> : down ? <ArrowDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      {fmtDelta(value)}
    </span>
  );
}

function Spark({ trend, positive }: { trend: number[]; positive: boolean }) {
  const w = 80;
  const h = 32;
  const min = Math.min(...trend);
  const max = Math.max(...trend);
  const span = max - min || 1;
  const points = trend
    .map((v, i) => {
      const x = (i / (trend.length - 1)) * w;
      const y = h - ((v - min) / span) * h;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline
        fill="none"
        stroke={positive ? 'hsl(var(--chart-2))' : 'hsl(var(--chart-5))'}
        strokeWidth={1.6}
        points={points}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
