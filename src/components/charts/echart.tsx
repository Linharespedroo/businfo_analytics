'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import type { EChartsOption } from 'echarts';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

interface EChartProps {
  option: EChartsOption;
  height?: number | string;
  className?: string;
  onEvents?: Record<string, (params: unknown) => void>;
}

export function EChart({ option, height = 280, className, onEvents }: EChartProps) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';

  const merged: EChartsOption = React.useMemo(() => {
    const textColor = dark ? '#e2e8f0' : '#0f172a';
    const subText = dark ? '#94a3b8' : '#64748b';
    const gridLine = dark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.06)';
    return {
      backgroundColor: 'transparent',
      textStyle: { fontFamily: 'inherit', color: textColor, fontSize: 12 },
      animationDuration: 600,
      animationEasing: 'cubicOut',
      grid: { left: 40, right: 16, top: 24, bottom: 28, containLabel: true },
      tooltip: {
        trigger: 'axis',
        backgroundColor: dark ? '#0f172a' : '#ffffff',
        borderColor: dark ? '#1e293b' : '#e2e8f0',
        borderWidth: 1,
        textStyle: { color: textColor, fontSize: 12 },
        axisPointer: { lineStyle: { color: subText } },
      },
      legend: { textStyle: { color: subText }, top: 0 },
      xAxis: {
        axisLine: { lineStyle: { color: gridLine } },
        axisLabel: { color: subText },
        splitLine: { lineStyle: { color: gridLine } },
      },
      yAxis: {
        axisLine: { show: false },
        axisLabel: { color: subText },
        splitLine: { lineStyle: { color: gridLine } },
      },
      ...option,
    } as EChartsOption;
  }, [option, dark]);

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ReactECharts
        option={merged}
        style={{ height: '100%', width: '100%' }}
        notMerge
        lazyUpdate
        opts={{ renderer: 'canvas' }}
        onEvents={onEvents}
      />
    </div>
  );
}
