/**
 * Aplica os filtros globais (cidades/órgãos/linhas/período) sobre as séries
 * derivadas do bundle. O bundle pré-agregado é multi-dimensional; aqui nós
 * apenas reduzimos.
 */
import type { AnalyticsBundle, DailyMetricRow } from '@/types/analytics';
import { presetDays, type FiltersState } from '@/lib/filters/store';

function withinDays(rows: DailyMetricRow[], days: number) {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.slice(-days);
}

export function filteredDaily(bundle: AnalyticsBundle, filters: FiltersState) {
  if (filters.preset === 'custom' && filters.startDate && filters.endDate) {
    return bundle.daily.filter(
      (r) => r.date >= filters.startDate! && r.date <= filters.endDate!
    );
  }
  return withinDays(bundle.daily, presetDays(filters.preset));
}

export function filteredCidades(bundle: AnalyticsBundle, filters: FiltersState) {
  return bundle.cidades.filter((c) => {
    if (filters.cidades.length && !filters.cidades.includes(c.cidade)) return false;
    if (filters.orgaos.length && !filters.orgaos.includes(c.orgao)) return false;
    return true;
  });
}

export function filteredLinhas(bundle: AnalyticsBundle, filters: FiltersState) {
  return bundle.topLinhas.filter((l) => {
    if (filters.cidades.length && !filters.cidades.includes(l.cidade)) return false;
    if (filters.orgaos.length && l.orgao && !filters.orgaos.includes(l.orgao))
      return false;
    if (filters.linhas.length && !filters.linhas.includes(l.linha)) return false;
    return true;
  });
}
