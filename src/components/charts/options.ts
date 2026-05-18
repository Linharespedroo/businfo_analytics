/**
 * Fábricas de option do ECharts. Compartilhadas entre páginas para coerência visual.
 */
import type { EChartsOption } from 'echarts';
import type { DailyMetricRow, HourlyHeatCell } from '@/types/analytics';
import { fmtCompact, fmtDate } from '@/lib/utils';

export function dailyLineOption(
  rows: DailyMetricRow[],
  series: Array<{ key: keyof DailyMetricRow; label: string; color?: string }>
): EChartsOption {
  return {
    color: series.map(
      (s, i) => s.color ?? `hsl(var(--chart-${(i % 6) + 1}))`
    ),
    legend: { show: series.length > 1 },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v) => fmtCompact(v as number),
    },
    xAxis: {
      type: 'category',
      data: rows.map((r) => r.date),
      axisLabel: {
        formatter: (val: string) => fmtDate(val),
      },
      boundaryGap: false,
    },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: (v: number) => fmtCompact(v) },
    },
    series: series.map((s) => ({
      name: s.label,
      type: 'line',
      smooth: true,
      showSymbol: false,
      data: rows.map((r) => Number(r[s.key] ?? 0)),
      areaStyle: { opacity: series.length === 1 ? 0.18 : 0 },
      lineStyle: { width: 2 },
    })),
  };
}

export function hourlyHeatmapOption(cells: HourlyHeatCell[]): EChartsOption {
  const weekdays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const data = cells.map((c) => [c.hour, c.weekday, c.value]);
  const max = Math.max(1, ...cells.map((c) => c.value));
  return {
    tooltip: {
      position: 'top',
      formatter: (p) => {
        const v = (p as unknown as { value: [number, number, number] }).value;
        return `${weekdays[v[1]]} · ${String(v[0]).padStart(2, '0')}h<br/>${fmtCompact(v[2])}`;
      },
    },
    grid: { top: 20, left: 60, right: 16, bottom: 40, containLabel: true },
    xAxis: {
      type: 'category',
      data: Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')),
      splitArea: { show: true },
    },
    yAxis: { type: 'category', data: weekdays, splitArea: { show: true } },
    visualMap: {
      min: 0,
      max,
      calculable: false,
      orient: 'horizontal',
      bottom: 0,
      itemWidth: 12,
      itemHeight: 8,
      text: ['alto', 'baixo'],
      inRange: {
        color: [
          'hsl(var(--chart-1) / 0.05)',
          'hsl(var(--chart-1) / 0.35)',
          'hsl(var(--chart-1) / 0.75)',
          'hsl(var(--chart-1))',
        ],
      },
    },
    series: [
      {
        type: 'heatmap',
        data,
        emphasis: { itemStyle: { borderColor: 'hsl(var(--ring))', borderWidth: 1 } },
        progressive: 200,
      },
    ],
  };
}

export function horizontalBarOption(
  rows: { name: string; value: number; secondary?: number }[],
  { secondaryLabel }: { secondaryLabel?: string } = {}
): EChartsOption {
  return {
    color: ['hsl(var(--chart-1))', 'hsl(var(--chart-2))'],
    legend: { show: !!secondaryLabel, top: 0 },
    grid: { left: 8, right: 24, top: secondaryLabel ? 28 : 8, bottom: 8, containLabel: true },
    tooltip: { valueFormatter: (v) => fmtCompact(v as number) },
    xAxis: { type: 'value', axisLabel: { formatter: (v: number) => fmtCompact(v) } },
    yAxis: {
      type: 'category',
      data: rows.map((r) => r.name).reverse(),
      axisLabel: { width: 160, overflow: 'truncate' },
    },
    series: [
      {
        name: 'Principal',
        type: 'bar',
        data: rows.map((r) => r.value).reverse(),
        barWidth: 14,
        itemStyle: { borderRadius: [0, 4, 4, 0] },
      },
      ...(secondaryLabel
        ? [
            {
              name: secondaryLabel,
              type: 'bar' as const,
              data: rows.map((r) => r.secondary ?? 0).reverse(),
              barWidth: 14,
              itemStyle: { borderRadius: [0, 4, 4, 0] as [number, number, number, number] },
            },
          ]
        : []),
    ],
  };
}

export function donutOption(slices: { name: string; value: number }[]): EChartsOption {
  return {
    color: Array.from({ length: 6 }, (_, i) => `hsl(var(--chart-${i + 1}))`),
    tooltip: { trigger: 'item', valueFormatter: (v) => fmtCompact(v as number) },
    legend: { bottom: 0, type: 'scroll' },
    series: [
      {
        type: 'pie',
        radius: ['58%', '78%'],
        center: ['50%', '46%'],
        avoidLabelOverlap: true,
        data: slices,
        label: { show: false },
        itemStyle: {
          borderColor: 'hsl(var(--background))',
          borderWidth: 2,
        },
      },
    ],
  };
}

export function funnelOption(
  steps: { step: string; users: number }[]
): EChartsOption {
  const max = steps[0]?.users ?? 0;
  return {
    color: Array.from({ length: 6 }, (_, i) => `hsl(var(--chart-${i + 1}))`),
    tooltip: {
      formatter: (p) => {
        const v = p as { name: string; value: number };
        const pct = max ? ((v.value / max) * 100).toFixed(1) : '0';
        return `<b>${v.name}</b><br/>${fmtCompact(v.value)} usuários · ${pct}%`;
      },
    },
    series: [
      {
        type: 'funnel',
        left: 16,
        right: 16,
        top: 10,
        bottom: 10,
        sort: 'descending',
        gap: 4,
        label: {
          position: 'inside',
          color: '#fff',
          fontWeight: 600,
          formatter: (p) =>
            `${(p as { name: string }).name}\n${fmtCompact((p as { value: number }).value)}`,
        },
        data: steps.map((s) => ({ name: s.step, value: s.users })),
      },
    ],
  };
}
