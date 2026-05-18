'use client';

import * as React from 'react';
import { Activity, Bus, Heart, MapPin, Search, Sparkles, Users } from 'lucide-react';
import { PageHeader } from '@/components/charts/page-header';
import { KpiTile } from '@/components/charts/kpi-tile';
import { SectionCard } from '@/components/charts/section-card';
import { EChart } from '@/components/charts/echart';
import { LoadingGrid } from '@/components/charts/loading-grid';
import {
  dailyLineOption,
  horizontalBarOption,
  hourlyHeatmapOption,
} from '@/components/charts/options';
import { useBundle } from '@/lib/data/use-bundle';
import { useFilters } from '@/lib/filters/store';
import { filteredCidades, filteredDaily, filteredLinhas } from '@/lib/analytics/filters';
import { totals, periodGrowth } from '@/lib/analytics/derive';
import { fmtCompact, fmtPct } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export default function ExecutivePage() {
  const { data, isLoading, error } = useBundle();
  const filters = useFilters();

  if (isLoading || !data) return <LoadingGrid />;
  if (error)
    return (
      <p className="text-sm text-destructive">
        Falha ao carregar dados. Verifique se <code>public/data/bundle.json</code> foi gerado.
      </p>
    );

  const daily = filteredDaily(data, filters);
  const totalsAll = totals(daily);
  const sparkUsers = daily.map((d) => d.users);
  const exec = data.executive;

  const topLinhas = filteredLinhas(data, filters).slice(0, 10);
  const cidades = filteredCidades(data, filters).slice(0, 8);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Visão Executiva"
        description="Indicadores estratégicos do BusInfo. Período e segmentos controlados pelos filtros globais."
      >
        <SourceBadge source={data.meta.source} updatedAt={data.meta.generatedAt} />
      </PageHeader>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiTile
          label="DAU"
          value={exec.dau}
          delta={exec.growthWoW}
          hint="vs. semana anterior"
          trend={sparkUsers}
          emphasis="primary"
        />
        <KpiTile label="WAU" value={exec.wau} hint="usuários ativos / 7d" trend={sparkUsers.slice(-14)} />
        <KpiTile label="MAU" value={exec.mau} delta={exec.growthMoM} hint="vs. mês anterior" trend={sparkUsers} />
        <KpiTile
          label="Stickiness"
          value={fmtPct(exec.stickiness)}
          hint="DAU / MAU"
          emphasis={exec.stickiness >= 0.2 ? 'success' : exec.stickiness >= 0.1 ? 'warn' : 'destructive'}
        />
      </section>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiTile label="Sessões (período)" value={totalsAll.sessions} />
        <KpiTile label="Eventos (período)" value={totalsAll.events} />
        <KpiTile label="Buscas de linha" value={totalsAll.buscas} delta={periodGrowth(daily, 7)} hint="WoW" />
        <KpiTile label="Favoritações" value={totalsAll.favoritos} />
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SectionCard
          className="xl:col-span-2"
          title="Tendência diária"
          description="Usuários ativos, sessões e eventos agregados por dia."
          exportName="tendencia-diaria.csv"
          exportCsv={() => daily}
        >
          <EChart
            height={300}
            option={dailyLineOption(daily, [
              { key: 'users', label: 'Usuários' },
              { key: 'sessions', label: 'Sessões' },
              { key: 'events', label: 'Eventos' },
            ])}
          />
        </SectionCard>

        <SectionCard
          title="Mix de ações"
          description="Distribuição dos principais eventos no período."
        >
          <EChart
            height={300}
            option={{
              tooltip: { trigger: 'item', valueFormatter: (v) => fmtCompact(v as number) },
              legend: { bottom: 0, type: 'scroll' },
              color: Array.from({ length: 6 }, (_, i) => `hsl(var(--chart-${i + 1}))`),
              series: [
                {
                  type: 'pie',
                  radius: ['58%', '78%'],
                  center: ['50%', '44%'],
                  itemStyle: {
                    borderColor: 'hsl(var(--background))',
                    borderWidth: 2,
                  },
                  label: { show: false },
                  data: [
                    { name: 'Buscas', value: totalsAll.buscas },
                    { name: 'Detalhes', value: totalsAll.detalhes },
                    { name: 'Favoritos', value: totalsAll.favoritos },
                    { name: 'Localização', value: totalsAll.localizacoes },
                    { name: 'Paradas', value: totalsAll.paradas },
                    { name: 'QR scans', value: totalsAll.qrScans },
                  ],
                },
              ],
            }}
          />
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard
          title="Top 10 linhas por busca"
          description="Linhas mais demandadas no período filtrado."
          exportCsv={() => topLinhas}
          exportName="top-linhas.csv"
        >
          <EChart
            height={300}
            option={horizontalBarOption(
              topLinhas.map((l) => ({
                name: `${l.linha} · ${l.cidade}`,
                value: l.buscas,
                secondary: l.detalhes,
              })),
              { secondaryLabel: 'Detalhes' }
            )}
          />
        </SectionCard>

        <SectionCard
          title="Heatmap dia × hora"
          description="Concentração de eventos por dia da semana e faixa horária."
        >
          <EChart height={300} option={hourlyHeatmapOption(data.hourly)} />
        </SectionCard>
      </div>

      <SectionCard
        title="Performance por cidade"
        description="Engajamento e crescimento por cidade/órgão."
        exportCsv={() => cidades}
        exportName="cidades.csv"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted-foreground border-b">
              <tr>
                <th className="px-3 py-2 text-left">Cidade</th>
                <th className="px-3 py-2 text-left">Órgão</th>
                <th className="px-3 py-2 text-right">Usuários</th>
                <th className="px-3 py-2 text-right">Buscas</th>
                <th className="px-3 py-2 text-right">Favoritos</th>
                <th className="px-3 py-2 text-right">WoW</th>
                <th className="px-3 py-2 text-right">MoM</th>
              </tr>
            </thead>
            <tbody>
              {cidades.map((c) => (
                <tr key={c.cidade} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-3 py-2 font-medium">{c.cidade}</td>
                  <td className="px-3 py-2"><Badge variant="secondary">{c.orgao}</Badge></td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtCompact(c.usuarios)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtCompact(c.buscas)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtCompact(c.favoritos)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${c.growthWoW >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                    {fmtPct(c.growthWoW)}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${c.growthMoM >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                    {fmtPct(c.growthMoM)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <FeaturePeek />
    </div>
  );
}

function FeaturePeek() {
  const cells = [
    { icon: Bus, label: 'Linhas', href: '/linhas', tag: 'Ranking & tendências' },
    { icon: Heart, label: 'Favoritos', href: '/favoritos', tag: 'Saldo & retenção' },
    { icon: MapPin, label: 'Paradas', href: '/paradas', tag: 'Falhas & uso' },
    { icon: Search, label: 'Localização', href: '/localizacao', tag: 'Precisão & falhas' },
    { icon: Users, label: 'Usuários', href: '/usuarios', tag: 'DAU/WAU/MAU & cohort' },
    { icon: Sparkles, label: 'Insights', href: '/insights', tag: 'Anomalias & alertas' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {cells.map(({ icon: Icon, label, href, tag }) => (
        <a
          key={href}
          href={href}
          className="group flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-accent"
        >
          <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium">{label}</div>
            <div className="truncate text-[11px] text-muted-foreground">{tag}</div>
          </div>
        </a>
      ))}
    </div>
  );
}

function SourceBadge({ source, updatedAt }: { source: string; updatedAt: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Activity className="h-3.5 w-3.5" />
      <Badge variant={source === 'live' ? 'success' : 'secondary'} className="uppercase">
        {source === 'live' ? 'Dados ao vivo' : 'Dados de demonstração'}
      </Badge>
      <span>
        Atualizado em{' '}
        {new Date(updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
      </span>
    </div>
  );
}
