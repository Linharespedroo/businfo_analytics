/**
 * Cálculos derivados aplicados aos dados pré-agregados em tempo de exibição.
 * Mantém o bundle enxuto: a derivação roda no client.
 */
import type { DailyMetricRow, RankedLinha } from '@/types/analytics';

export function totals(rows: DailyMetricRow[]) {
  return rows.reduce(
    (acc, r) => {
      acc.users += r.users;
      acc.sessions += r.sessions;
      acc.events += r.events;
      acc.buscas += r.buscas;
      acc.favoritos += r.favoritos;
      acc.detalhes += r.detalhes;
      acc.localizacoes += r.localizacoes;
      acc.paradas += r.paradas;
      acc.qrScans += r.qrScans;
      return acc;
    },
    {
      users: 0,
      sessions: 0,
      events: 0,
      buscas: 0,
      favoritos: 0,
      detalhes: 0,
      localizacoes: 0,
      paradas: 0,
      qrScans: 0,
    }
  );
}

export function periodGrowth(rows: DailyMetricRow[], days: number) {
  if (rows.length < days * 2) return 0;
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sorted.slice(-days);
  const previous = sorted.slice(-days * 2, -days);
  const sum = (xs: DailyMetricRow[], k: keyof DailyMetricRow) =>
    xs.reduce((acc, x) => acc + (Number(x[k]) || 0), 0);
  const a = sum(recent, 'users');
  const b = sum(previous, 'users');
  if (b === 0) return a > 0 ? 1 : 0;
  return (a - b) / b;
}

export function topN<T extends { buscas?: number; saldoFavoritos?: number }>(
  rows: T[],
  n: number,
  by: keyof T = 'buscas' as keyof T
) {
  return [...rows]
    .sort((a, b) => Number(b[by] ?? 0) - Number(a[by] ?? 0))
    .slice(0, n);
}

export function emerging(linhas: RankedLinha[], n = 10) {
  return [...linhas]
    .filter((l) => l.buscas >= 30) // evita ruído de cauda longa
    .sort((a, b) => b.growthWoW - a.growthWoW)
    .slice(0, n);
}
