'use client';

import { PageHeader } from '@/components/charts/page-header';
import { SectionCard } from '@/components/charts/section-card';
import { KpiTile } from '@/components/charts/kpi-tile';
import { LoadingGrid } from '@/components/charts/loading-grid';
import { useBundle } from '@/lib/data/use-bundle';
import { useFilters } from '@/lib/filters/store';
import { filteredDaily } from '@/lib/analytics/filters';
import { EChart } from '@/components/charts/echart';
import { dailyLineOption, funnelOption } from '@/components/charts/options';
import { fmtCompact, fmtPct } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

export default function UsuariosPage() {
  const { data, isLoading } = useBundle();
  const filters = useFilters();
  if (isLoading || !data) return <LoadingGrid />;

  const daily = filteredDaily(data, filters);
  const exec = data.executive;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Usuários"
        description="Métricas de engajamento, retenção em cohorts e funil de utilização."
      />

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiTile label="DAU médio" value={exec.dau} />
        <KpiTile label="WAU" value={exec.wau} />
        <KpiTile label="MAU" value={exec.mau} />
        <KpiTile
          label="Stickiness"
          value={fmtPct(exec.stickiness)}
          emphasis={exec.stickiness > 0.2 ? 'success' : 'warn'}
        />
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SectionCard
          className="xl:col-span-2"
          title="Novos × recorrentes"
          exportCsv={() => daily}
          exportName="usuarios-diaria.csv"
        >
          <EChart
            option={dailyLineOption(daily, [
              { key: 'users', label: 'Ativos' },
              { key: 'newUsers', label: 'Novos' },
            ])}
            height={320}
          />
        </SectionCard>

        <SectionCard
          title="Funil de uso"
          description="Buscar → Detalhe → Favoritar → Filtrar veículo"
        >
          <EChart option={funnelOption(data.funnel)} height={320} />
        </SectionCard>
      </div>

      <SectionCard
        title="Cohort de retenção"
        description="Cada linha representa um cohort semanal (semana de aquisição). Valores são % retidos N semanas depois."
        exportCsv={() =>
          data.cohorts.map((c) => ({
            cohort: c.cohort,
            size: c.size,
            ...Object.fromEntries(c.retention.map((v, i) => [`s${i}`, v])),
          }))
        }
        exportName="cohort.csv"
      >
        <CohortGrid />
      </SectionCard>
    </div>
  );
}

function CohortGrid() {
  const { data } = useBundle();
  if (!data) return null;
  const maxLen = Math.max(...data.cohorts.map((c) => c.retention.length));
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cohort</TableHead>
          <TableHead className="text-right">Tamanho</TableHead>
          {Array.from({ length: maxLen }, (_, i) => (
            <TableHead key={i} className="text-right">
              S{i}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.cohorts.map((c) => (
          <TableRow key={c.cohort}>
            <TableCell className="font-medium">{c.cohort}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtCompact(c.size)}</TableCell>
            {Array.from({ length: maxLen }, (_, i) => {
              const v = c.retention[i];
              return (
                <TableCell key={i} className="text-right tabular-nums">
                  {v == null ? (
                    '—'
                  ) : (
                    <CohortCell value={v} />
                  )}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function CohortCell({ value }: { value: number }) {
  // 0..1 → gradiente azul
  const intensity = Math.max(0.05, Math.min(1, value));
  return (
    <span
      className={cn('inline-block rounded px-1.5 py-0.5 text-xs')}
      style={{
        background: `hsl(var(--chart-1) / ${intensity * 0.4})`,
        color: intensity > 0.5 ? 'hsl(var(--primary))' : undefined,
      }}
    >
      {fmtPct(value)}
    </span>
  );
}
