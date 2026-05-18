'use client';

import { TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/charts/page-header';
import { SectionCard } from '@/components/charts/section-card';
import { EChart } from '@/components/charts/echart';
import { LoadingGrid } from '@/components/charts/loading-grid';
import { Badge } from '@/components/ui/badge';
import { useBundle } from '@/lib/data/use-bundle';
import { useFilters } from '@/lib/filters/store';
import { filteredLinhas } from '@/lib/analytics/filters';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fmtCompact, fmtPct } from '@/lib/utils';
import { horizontalBarOption } from '@/components/charts/options';

export default function LinhasPage() {
  const { data, isLoading } = useBundle();
  const filters = useFilters();
  if (isLoading || !data) return <LoadingGrid />;

  const linhas = filteredLinhas(data, filters);
  const top = linhas.slice(0, 25);
  const emerging = data.emergingLinhas.slice(0, 10);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Análise de Linhas"
        description="Ranking de linhas mais buscadas, detalhes e conversão para favorito."
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SectionCard
          className="xl:col-span-2"
          title="Top 25 linhas"
          exportCsv={() => top}
          exportName="top-linhas.csv"
        >
          <EChart
            height={Math.max(360, top.length * 22)}
            option={horizontalBarOption(
              top.map((l) => ({
                name: `${l.linha} · ${l.cidade}`,
                value: l.buscas,
                secondary: l.detalhes,
              })),
              { secondaryLabel: 'Detalhes' }
            )}
          />
        </SectionCard>

        <SectionCard
          title="Linhas emergentes"
          description="Maior crescimento semana sobre semana (mín. 30 buscas)."
        >
          <ul className="space-y-2">
            {emerging.map((l) => (
              <li
                key={`${l.linha}-${l.cidade}`}
                className="flex items-center justify-between rounded-md border p-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{l.linha}</div>
                  <div className="text-[11px] text-muted-foreground">{l.cidade}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="success" className="gap-1">
                    <TrendingUp className="h-3 w-3" />
                    {fmtPct(l.growthWoW)}
                  </Badge>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {fmtCompact(l.buscas)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <SectionCard
        title="Tabela completa"
        description="Ordenado por buscas. Use os filtros globais para segmentar."
        exportCsv={() => linhas}
        exportName="linhas.csv"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Linha</TableHead>
              <TableHead>Cidade</TableHead>
              <TableHead>Órgão</TableHead>
              <TableHead className="text-right">Buscas</TableHead>
              <TableHead className="text-right">Detalhes</TableHead>
              <TableHead className="text-right">Favoritados</TableHead>
              <TableHead className="text-right">Saldo Fav.</TableHead>
              <TableHead className="text-right">Únicos</TableHead>
              <TableHead className="text-right">Conv.</TableHead>
              <TableHead className="text-right">WoW</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.slice(0, 80).map((l) => (
              <TableRow key={`${l.linha}-${l.cidade}`}>
                <TableCell className="font-medium">{l.linha}</TableCell>
                <TableCell>{l.cidade}</TableCell>
                <TableCell>
                  {l.orgao ? <Badge variant="secondary">{l.orgao}</Badge> : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtCompact(l.buscas)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtCompact(l.detalhes)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtCompact(l.favoritados)}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums ${
                    l.saldoFavoritos >= 0 ? 'text-emerald-500' : 'text-destructive'
                  }`}
                >
                  {l.saldoFavoritos > 0 ? '+' : ''}
                  {fmtCompact(l.saldoFavoritos)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtCompact(l.usuariosUnicos)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtPct(l.taxaConversao)}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums ${
                    l.growthWoW >= 0 ? 'text-emerald-500' : 'text-destructive'
                  }`}
                >
                  {fmtPct(l.growthWoW)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>
    </div>
  );
}
