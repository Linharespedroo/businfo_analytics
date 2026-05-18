/**
 * Schemas dos artefatos JSON gerados pelo data-pipeline e consumidos pelo dashboard.
 * Cada chave aqui corresponde a um arquivo em `public/data/`.
 */
import type { EventName } from './events';

export interface DatasetMeta {
  generatedAt: string;
  rangeStart: string;
  rangeEnd: string;
  lookbackDays: number;
  source: 'live' | 'sample';
  pipelineVersion: string;
  cidades: string[];
  orgaos: string[];
  events: EventName[];
}

export interface DailyMetricRow {
  date: string;
  users: number;
  newUsers: number;
  sessions: number;
  events: number;
  buscas: number;
  favoritos: number;
  detalhes: number;
  localizacoes: number;
  paradas: number;
  qrScans: number;
}

export interface ExecutiveSummary {
  dau: number;
  wau: number;
  mau: number;
  stickiness: number;
  totalSessoes: number;
  totalEventos: number;
  totalUsuarios: number;
  totalBuscas: number;
  totalFavoritados: number;
  tempoMedioSessaoSeg: number;
  growthWoW: number;
  growthMoM: number;
  growthYoY: number;
}

export interface HourlyHeatCell {
  weekday: number;
  hour: number;
  value: number;
}

export interface RankedLinha {
  linha: string;
  cidade: string;
  orgao?: string;
  operador?: string;
  area?: string;
  buscas: number;
  detalhes: number;
  favoritados: number;
  removidos: number;
  saldoFavoritos: number;
  usuariosUnicos: number;
  taxaConversao: number;
  growthWoW: number;
}

export interface FavoritoMetric {
  linha: string;
  cidade: string;
  adicionados: number;
  removidos: number;
  saldo: number;
  ratio: number;
}

export interface CidadeMetric {
  cidade: string;
  orgao: string;
  usuarios: number;
  buscas: number;
  detalhes: number;
  favoritos: number;
  growthWoW: number;
  growthMoM: number;
}

export interface GeoPoint {
  lat: number;
  lon: number;
  weight: number;
  precisao?: string;
}

export interface ParadaMetric {
  paradaId: string;
  paradaNome: string;
  fonte: string;
  acessos: number;
  erros: number;
  taxaErro: number;
  ultimoErro?: string;
  cidade?: string;
}

export interface FunnelStep {
  step: string;
  event: EventName;
  users: number;
  dropoff: number;
}

export interface CohortRow {
  cohort: string;
  size: number;
  retention: number[];
}

export interface AnomalyAlert {
  date: string;
  metric: string;
  observed: number;
  expected: number;
  zScore: number;
  severity: 'info' | 'warn' | 'critical';
  description: string;
}

export interface Insight {
  id: string;
  title: string;
  body: string;
  severity: 'info' | 'positive' | 'warn' | 'critical';
  metric?: string;
  delta?: number;
  href?: string;
}

export interface AnalyticsBundle {
  meta: DatasetMeta;
  executive: ExecutiveSummary;
  daily: DailyMetricRow[];
  hourly: HourlyHeatCell[];
  topLinhas: RankedLinha[];
  emergingLinhas: RankedLinha[];
  favoritos: FavoritoMetric[];
  cidades: CidadeMetric[];
  geoPoints: GeoPoint[];
  paradas: ParadaMetric[];
  funnel: FunnelStep[];
  cohorts: CohortRow[];
  anomalies: AnomalyAlert[];
  insights: Insight[];
}
