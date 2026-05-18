'use client';

import { PageHeader } from '@/components/charts/page-header';
import { SectionCard } from '@/components/charts/section-card';
import { KpiTile } from '@/components/charts/kpi-tile';
import { LoadingGrid } from '@/components/charts/loading-grid';
import { HeatMap } from '@/components/maps/heat-map';
import { useBundle } from '@/lib/data/use-bundle';
import { useFilters } from '@/lib/filters/store';
import { filteredCidades } from '@/lib/analytics/filters';
import { EChart } from '@/components/charts/echart';
import { horizontalBarOption } from '@/components/charts/options';
import { fmtCompact, fmtPct } from '@/lib/utils';

export default function GeoPage() {
  const { data, isLoading } = useBundle();
  const filters = useFilters();
  if (isLoading || !data) return <LoadingGrid />;

  const cidades = filteredCidades(data, filters);
  const totalPontos = data.geoPoints.length;
  const totalUsuariosCidades = cidades.reduce((a, b) => a + b.usuarios, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Geoanálise"
        description="Densidade de uso, distribuição por cidade e crescimento regional."
      />

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiTile label="Pontos geo (período)" value={totalPontos} />
        <KpiTile label="Cidades ativas" value={cidades.length} />
        <KpiTile label="Usuários cobertos" value={totalUsuariosCidades} />
        <KpiTile
          label="Cidade líder"
          value={cidades[0]?.cidade ?? '—'}
          hint={cidades[0] ? `${fmtCompact(cidades[0].usuarios)} usuários` : ''}
        />
      </section>

      <SectionCard
        title="Mapa de calor"
        description="Densidade dos eventos usar_localizacao no período. Use zoom para cidades específicas."
      >
        <HeatMap points={data.geoPoints} height={520} />
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard
          title="Distribuição por cidade"
          exportCsv={() => cidades}
          exportName="cidades.csv"
        >
          <EChart
            height={Math.max(320, cidades.length * 22)}
            option={horizontalBarOption(
              cidades.slice(0, 18).map((c) => ({
                name: `${c.cidade} · ${c.orgao}`,
                value: c.usuarios,
                secondary: c.buscas,
              })),
              { secondaryLabel: 'Buscas' }
            )}
          />
        </SectionCard>

        <SectionCard title="Crescimento MoM por cidade">
          <ul className="space-y-1">
            {cidades
              .slice()
              .sort((a, b) => b.growthMoM - a.growthMoM)
              .slice(0, 12)
              .map((c) => (
                <li
                  key={c.cidade}
                  className="flex items-center justify-between rounded-md border p-2"
                >
                  <span className="text-sm">
                    {c.cidade}{' '}
                    <span className="text-xs text-muted-foreground">· {c.orgao}</span>
                  </span>
                  <span
                    className={`tabular-nums text-sm ${
                      c.growthMoM >= 0 ? 'text-emerald-500' : 'text-destructive'
                    }`}
                  >
                    {fmtPct(c.growthMoM)}
                  </span>
                </li>
              ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
