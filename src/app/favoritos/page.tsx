'use client';

import { PageHeader } from '@/components/charts/page-header';
import { SectionCard } from '@/components/charts/section-card';
import { KpiTile } from '@/components/charts/kpi-tile';
import { EChart } from '@/components/charts/echart';
import { LoadingGrid } from '@/components/charts/loading-grid';
import { useBundle } from '@/lib/data/use-bundle';
import { fmtCompact, fmtPct } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { horizontalBarOption } from '@/components/charts/options';

export default function FavoritosPage() {
  const { data, isLoading } = useBundle();
  if (isLoading || !data) return <LoadingGrid />;

  const all = data.favoritos;
  const adicionados = all.reduce((a, b) => a + b.adicionados, 0);
  const removidos = all.reduce((a, b) => a + b.removidos, 0);
  const saldo = adicionados - removidos;
  const taxaRet = removidos > 0 ? 1 - removidos / Math.max(1, adicionados) : 1;

  const topAdded = [...all].sort((a, b) => b.adicionados - a.adicionados).slice(0, 15);
  const topRemoved = [...all].sort((a, b) => b.removidos - a.removidos).slice(0, 10);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Favoritos"
        description="Linhas favoritadas e removidas, com saldo líquido e taxa de retenção."
      />

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiTile label="Adicionados" value={adicionados} emphasis="success" />
        <KpiTile label="Removidos" value={removidos} emphasis="destructive" />
        <KpiTile label="Saldo líquido" value={saldo} emphasis={saldo >= 0 ? 'success' : 'destructive'} />
        <KpiTile
          label="Retenção de favoritos"
          value={fmtPct(taxaRet)}
          hint="1 - removidos / adicionados"
          emphasis={taxaRet > 0.8 ? 'success' : taxaRet > 0.6 ? 'warn' : 'destructive'}
        />
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard
          title="Top 15 linhas mais favoritadas"
          exportCsv={() => topAdded}
          exportName="top-favoritos.csv"
        >
          <EChart
            height={Math.max(360, topAdded.length * 22)}
            option={horizontalBarOption(
              topAdded.map((f) => ({
                name: `${f.linha} · ${f.cidade}`,
                value: f.adicionados,
                secondary: f.removidos,
              })),
              { secondaryLabel: 'Removidos' }
            )}
          />
        </SectionCard>

        <SectionCard
          title="Saldo líquido"
          description="Adicionados − removidos, ordenado por maior remoção (sinais de churn)."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Linha</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead className="text-right">Adic.</TableHead>
                <TableHead className="text-right">Remov.</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="text-right">Ratio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topRemoved.map((f) => (
                <TableRow key={`${f.linha}-${f.cidade}`}>
                  <TableCell className="font-medium">{f.linha}</TableCell>
                  <TableCell>{f.cidade}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtCompact(f.adicionados)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtCompact(f.removidos)}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${
                      f.saldo >= 0 ? 'text-emerald-500' : 'text-destructive'
                    }`}
                  >
                    {f.saldo > 0 ? '+' : ''}
                    {fmtCompact(f.saldo)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtPct(f.ratio)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      </div>
    </div>
  );
}
