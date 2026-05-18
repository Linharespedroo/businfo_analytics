'use client';

import { AlertTriangle } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { horizontalBarOption } from '@/components/charts/options';

export default function ParadasPage() {
  const { data, isLoading } = useBundle();
  if (isLoading || !data) return <LoadingGrid />;

  const all = data.paradas;
  const totalAcessos = all.reduce((a, b) => a + b.acessos, 0);
  const totalErros = all.reduce((a, b) => a + b.erros, 0);
  const taxaErro = totalAcessos > 0 ? totalErros / totalAcessos : 0;
  const fontes = Array.from(new Set(all.map((p) => p.fonte))).filter(Boolean);

  const topAcessos = [...all].sort((a, b) => b.acessos - a.acessos).slice(0, 20);
  const piores = [...all]
    .filter((p) => p.acessos > 20)
    .sort((a, b) => b.taxaErro - a.taxaErro)
    .slice(0, 12);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Paradas"
        description="Cliques em paradas, fontes (SPTrans/EMTU/...) e falhas reportadas pelo Firebase."
      />

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiTile label="Cliques em paradas" value={totalAcessos} emphasis="primary" />
        <KpiTile
          label="Erros"
          value={totalErros}
          emphasis={totalErros > 0 ? 'destructive' : 'success'}
        />
        <KpiTile
          label="Taxa de erro"
          value={fmtPct(taxaErro)}
          emphasis={taxaErro > 0.1 ? 'destructive' : taxaErro > 0.03 ? 'warn' : 'success'}
        />
        <KpiTile label="Fontes ativas" value={fontes.length} hint={fontes.slice(0, 4).join(', ')} />
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard
          title="Paradas mais acessadas"
          exportCsv={() => topAcessos}
          exportName="top-paradas.csv"
        >
          <EChart
            height={Math.max(360, topAcessos.length * 22)}
            option={horizontalBarOption(
              topAcessos.map((p) => ({
                name: p.paradaNome || p.paradaId,
                value: p.acessos,
                secondary: p.erros,
              })),
              { secondaryLabel: 'Erros' }
            )}
          />
        </SectionCard>

        <SectionCard
          title="Paradas com maior taxa de erro"
          description="Mínimo 20 acessos para reduzir ruído de cauda longa."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Parada</TableHead>
                <TableHead>Fonte</TableHead>
                <TableHead className="text-right">Acessos</TableHead>
                <TableHead className="text-right">Erros</TableHead>
                <TableHead className="text-right">Taxa</TableHead>
                <TableHead>Último erro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {piores.map((p) => (
                <TableRow key={p.paradaId}>
                  <TableCell className="font-medium">
                    {p.paradaNome || p.paradaId}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{p.fonte}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtCompact(p.acessos)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-destructive">
                    {fmtCompact(p.erros)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Badge variant={p.taxaErro > 0.2 ? 'destructive' : 'warn'}>
                      <AlertTriangle className="mr-1 h-3 w-3" />
                      {fmtPct(p.taxaErro)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {p.ultimoErro ?? '—'}
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
