'use client';

import { PageHeader } from '@/components/charts/page-header';
import { SectionCard } from '@/components/charts/section-card';
import { KpiTile } from '@/components/charts/kpi-tile';
import { LoadingGrid } from '@/components/charts/loading-grid';
import { useBundle } from '@/lib/data/use-bundle';
import { useFilters } from '@/lib/filters/store';
import { filteredDaily } from '@/lib/analytics/filters';
import { EChart } from '@/components/charts/echart';
import {
  dailyLineOption,
  donutOption,
  hourlyHeatmapOption,
} from '@/components/charts/options';
import { fmtCompact, fmtPct } from '@/lib/utils';

export default function LocalizacaoPage() {
  const { data, isLoading } = useBundle();
  const filters = useFilters();
  if (isLoading || !data) return <LoadingGrid />;

  const daily = filteredDaily(data, filters);
  const totalLoc = daily.reduce((a, b) => a + b.localizacoes, 0);
  const totalUsers = daily.reduce((a, b) => a + b.users, 0);
  const adoção = totalUsers > 0 ? totalLoc / totalUsers : 0;

  // Estima distribuição de precisão a partir dos pontos geo.
  const precisaoCount = data.geoPoints.reduce<Record<string, number>>((acc, p) => {
    const k = p.precisao ?? 'desconhecida';
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  const precisaoSlices = Object.entries(precisaoCount).map(([name, value]) => ({
    name,
    value,
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Localização"
        description="Adoção da geolocalização, precisão e padrões temporais."
      />

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiTile label="Eventos de localização" value={totalLoc} emphasis="primary" />
        <KpiTile label="Adoção" value={fmtPct(adoção)} hint="loc / usuários ativos" />
        <KpiTile
          label="Pontos coletados"
          value={data.geoPoints.length}
          hint="amostragem geo"
        />
        <KpiTile
          label="Precisão alta"
          value={fmtCompact(precisaoCount['alta'] ?? 0)}
          emphasis="success"
        />
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SectionCard
          className="xl:col-span-2"
          title="Tendência diária"
          exportCsv={() => daily}
          exportName="localizacao-diaria.csv"
        >
          <EChart
            option={dailyLineOption(daily, [
              { key: 'localizacoes', label: 'Localizações' },
              { key: 'users', label: 'Usuários ativos' },
            ])}
            height={320}
          />
        </SectionCard>
        <SectionCard title="Distribuição de precisão">
          <EChart option={donutOption(precisaoSlices)} height={320} />
        </SectionCard>
      </div>

      <SectionCard title="Padrão por dia × hora">
        <EChart option={hourlyHeatmapOption(data.hourly)} height={320} />
      </SectionCard>
    </div>
  );
}
