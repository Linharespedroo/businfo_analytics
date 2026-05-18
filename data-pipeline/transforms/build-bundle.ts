/**
 * Recebe resultados brutos das queries e produz o AnalyticsBundle final.
 * Toda lógica de derivação não-trivial (insights, anomalias, percentuais)
 * roda aqui em JS — sem custo BQ adicional.
 */
import type {
  AnalyticsBundle,
  AnomalyAlert,
  CohortRow,
  DailyMetricRow,
  ExecutiveSummary,
  FavoritoMetric,
  FunnelStep,
  GeoPoint,
  HourlyHeatCell,
  Insight,
  ParadaMetric,
  RankedLinha,
  CidadeMetric,
} from '../../src/types/analytics';
import { detectAnomalies } from '../../src/lib/analytics/anomaly';
import type { LinhaMetadata, CidadeMetadata } from '../neon/queries';

export interface RawInputs {
  daily: Array<{
    data: string;
    users: number;
    new_users: number;
    sessions: number;
    events: number;
    buscas: number;
    favoritos: number;
    detalhes: number;
    localizacoes: number;
    paradas: number;
    qr_scans: number;
  }>;
  hourly: Array<{ weekday: number; hour: number; value: number }>;
  linhas: Array<{
    linha: string;
    cidade: string;
    buscas: number;
    detalhes: number;
    favoritados: number;
    removidos: number;
    usuarios_unicos: number;
  }>;
  linhaGrowth: Array<{ linha: string; cidade: string; recent: number; previous: number }>;
  favoritos: Array<{
    linha: string;
    cidade: string;
    adicionados: number;
    removidos: number;
  }>;
  cidades: Array<{
    cidade: string;
    usuarios: number;
    buscas: number;
    detalhes: number;
    favoritos: number;
    recent_7d: number;
    previous_7d: number;
    recent_30d: number;
    previous_30d: number;
  }>;
  geoPoints: Array<{ lat: number; lon: number; precisao?: string; weight: number }>;
  paradas: Array<{
    parada_id: string;
    parada_nome: string | null;
    fonte: string | null;
    acessos: number;
    erros: number;
    ultimo_erro: string | null;
  }>;
  funnel: Array<{ s1: number; s2: number; s3: number; s4: number }>;
  cohortsRaw: Array<{ cohort_week: string; week_offset: number; users: number }>;
  source: 'live' | 'sample';
}

export interface MetadataInputs {
  linhasMeta: LinhaMetadata[];
  cidadesMeta: CidadeMetadata[];
}

const PIPELINE_VERSION = '1.0.0';

export function buildBundle(
  raw: RawInputs,
  meta: MetadataInputs
): AnalyticsBundle {
  const daily: DailyMetricRow[] = raw.daily.map((d) => ({
    date: typeof d.data === 'string' ? d.data : new Date(d.data).toISOString().slice(0, 10),
    users: Number(d.users) || 0,
    newUsers: Number(d.new_users) || 0,
    sessions: Number(d.sessions) || 0,
    events: Number(d.events) || 0,
    buscas: Number(d.buscas) || 0,
    favoritos: Number(d.favoritos) || 0,
    detalhes: Number(d.detalhes) || 0,
    localizacoes: Number(d.localizacoes) || 0,
    paradas: Number(d.paradas) || 0,
    qrScans: Number(d.qr_scans) || 0,
  }));

  const hourly: HourlyHeatCell[] = raw.hourly.map((h) => ({
    weekday: Number(h.weekday) % 7,
    hour: Number(h.hour),
    value: Number(h.value),
  }));

  // Index growth/meta para join client-side
  const growthIdx = new Map<string, number>();
  for (const g of raw.linhaGrowth) {
    const denom = g.previous || 1;
    growthIdx.set(key(g.linha, g.cidade), (g.recent - g.previous) / denom);
  }
  const metaIdx = new Map<string, LinhaMetadata>();
  for (const m of meta.linhasMeta) metaIdx.set(key(m.linha, m.cidade), m);

  const topLinhas: RankedLinha[] = raw.linhas.map((l) => {
    const m = metaIdx.get(key(l.linha, l.cidade));
    const saldo = l.favoritados - l.removidos;
    return {
      linha: l.linha,
      cidade: l.cidade,
      orgao: m?.orgao,
      operador: m?.operador,
      area: m?.area ?? undefined,
      buscas: l.buscas,
      detalhes: l.detalhes,
      favoritados: l.favoritados,
      removidos: l.removidos,
      saldoFavoritos: saldo,
      usuariosUnicos: l.usuarios_unicos,
      taxaConversao: l.buscas > 0 ? l.favoritados / l.buscas : 0,
      growthWoW: growthIdx.get(key(l.linha, l.cidade)) ?? 0,
    };
  });

  const emergingLinhas = [...topLinhas]
    .filter((l) => l.buscas >= 30)
    .sort((a, b) => b.growthWoW - a.growthWoW)
    .slice(0, 20);

  const favoritos: FavoritoMetric[] = raw.favoritos.map((f) => ({
    linha: f.linha,
    cidade: f.cidade,
    adicionados: f.adicionados,
    removidos: f.removidos,
    saldo: f.adicionados - f.removidos,
    ratio: f.adicionados > 0 ? 1 - f.removidos / f.adicionados : 0,
  }));

  const cidades: CidadeMetric[] = raw.cidades.map((c) => {
    const m = meta.cidadesMeta.find((x) => x.cidade === c.cidade);
    const wow = c.previous_7d > 0 ? (c.recent_7d - c.previous_7d) / c.previous_7d : 0;
    const mom = c.previous_30d > 0 ? (c.recent_30d - c.previous_30d) / c.previous_30d : 0;
    return {
      cidade: c.cidade,
      orgao: m?.orgao ?? inferOrgao(c.cidade),
      usuarios: c.usuarios,
      buscas: c.buscas,
      detalhes: c.detalhes,
      favoritos: c.favoritos,
      growthWoW: wow,
      growthMoM: mom,
    };
  });

  const geoPoints: GeoPoint[] = raw.geoPoints.map((p) => ({
    lat: Number(p.lat),
    lon: Number(p.lon),
    weight: Number(p.weight) || 1,
    precisao: p.precisao,
  }));

  const paradas: ParadaMetric[] = raw.paradas.map((p) => ({
    paradaId: p.parada_id,
    paradaNome: p.parada_nome ?? p.parada_id,
    fonte: p.fonte ?? '—',
    acessos: p.acessos,
    erros: p.erros,
    taxaErro: p.acessos > 0 ? p.erros / p.acessos : 0,
    ultimoErro: p.ultimo_erro ?? undefined,
  }));

  const funnel: FunnelStep[] = (() => {
    const f = raw.funnel[0];
    if (!f) return [];
    const steps = [
      { step: 'Buscar linha', event: 'buscar_linha' as const, users: f.s1 },
      { step: 'Ver detalhe', event: 'ver_detalhe_linha' as const, users: f.s2 },
      { step: 'Favoritar', event: 'adicionar_favorito' as const, users: f.s3 },
      { step: 'Filtrar veículo', event: 'filtrar_veiculo' as const, users: f.s4 },
    ];
    return steps.map((s, i) => ({
      ...s,
      dropoff: i > 0 && steps[i - 1].users > 0
        ? 1 - s.users / steps[i - 1].users
        : 0,
    }));
  })();

  const cohorts = buildCohorts(raw.cohortsRaw);

  const executive = buildExecutive(daily, funnel);
  const anomalies = buildAnomalyAlerts(daily);
  const insights = buildInsights(executive, topLinhas, cidades, paradas, anomalies);

  const cidadesList = Array.from(new Set(cidades.map((c) => c.cidade))).sort();
  const orgaosList = Array.from(new Set(cidades.map((c) => c.orgao))).sort();

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      rangeStart: daily[0]?.date ?? '',
      rangeEnd: daily[daily.length - 1]?.date ?? '',
      lookbackDays: daily.length,
      source: raw.source,
      pipelineVersion: PIPELINE_VERSION,
      cidades: cidadesList,
      orgaos: orgaosList,
      events: [
        'session_start',
        'buscar_linha',
        'ver_detalhe_linha',
        'adicionar_favorito',
        'remover_favorito',
        'filtrar_veiculo',
        'usar_localizacao',
        'tocar_parada',
        'qr_scan',
      ],
    },
    executive,
    daily,
    hourly,
    topLinhas: topLinhas.sort((a, b) => b.buscas - a.buscas).slice(0, 150),
    emergingLinhas,
    favoritos,
    cidades,
    geoPoints,
    paradas,
    funnel,
    cohorts,
    anomalies,
    insights,
  };
}

function key(linha: string, cidade: string) {
  return `${linha}__${cidade}`;
}

function inferOrgao(cidade: string): string {
  if (!cidade) return 'Outros';
  if (/^sp/i.test(cidade)) return 'SPTrans';
  if (/^emtu/i.test(cidade)) return 'EMTU';
  if (/rio.*brt/i.test(cidade)) return 'BRT Rio';
  if (/^rio/i.test(cidade)) return 'Prefeitura RJ';
  return 'Outros';
}

function buildExecutive(daily: DailyMetricRow[], funnel: FunnelStep[]): ExecutiveSummary {
  const last = daily.slice(-30);
  const prev = daily.slice(-60, -30);
  const last7 = daily.slice(-7);
  const prev7 = daily.slice(-14, -7);
  const sum = (xs: DailyMetricRow[], k: keyof DailyMetricRow) =>
    xs.reduce((a, x) => a + (Number(x[k]) || 0), 0);

  const dau = last7.length ? Math.round(sum(last7, 'users') / last7.length) : 0;
  const wau = sum(last7, 'users');
  const mau = sum(last, 'users');
  const stickiness = mau > 0 ? wau / mau : 0;
  const growthWoW =
    sum(prev7, 'users') > 0
      ? (sum(last7, 'users') - sum(prev7, 'users')) / sum(prev7, 'users')
      : 0;
  const growthMoM =
    sum(prev, 'users') > 0
      ? (sum(last, 'users') - sum(prev, 'users')) / sum(prev, 'users')
      : 0;

  return {
    dau,
    wau,
    mau,
    stickiness,
    totalSessoes: daily.reduce((a, d) => a + d.sessions, 0),
    totalEventos: daily.reduce((a, d) => a + d.events, 0),
    totalUsuarios: mau,
    totalBuscas: daily.reduce((a, d) => a + d.buscas, 0),
    totalFavoritados: daily.reduce((a, d) => a + d.favoritos, 0),
    tempoMedioSessaoSeg: 0,
    growthWoW,
    growthMoM,
    growthYoY: 0,
  };
}

function buildAnomalyAlerts(daily: DailyMetricRow[]): AnomalyAlert[] {
  const anom = detectAnomalies(
    daily.map((d) => ({ date: d.date, value: d.users })),
    { window: 14, threshold: 2.5 }
  );
  return anom.map((a) => ({
    date: a.date,
    metric: 'usuarios_ativos',
    observed: a.value,
    expected: a.expected,
    zScore: Number(a.z.toFixed(2)),
    severity: a.severity,
    description: `Usuários ativos ${a.value > a.expected ? 'acima' : 'abaixo'} do esperado (z=${a.z.toFixed(2)}).`,
  }));
}

function buildInsights(
  exec: ExecutiveSummary,
  linhas: RankedLinha[],
  cidades: CidadeMetric[],
  paradas: ParadaMetric[],
  anomalies: AnomalyAlert[]
): Insight[] {
  const out: Insight[] = [];

  out.push({
    id: 'dau-growth',
    title: exec.growthWoW >= 0 ? 'DAU em alta' : 'DAU em queda',
    body:
      exec.growthWoW >= 0
        ? `Os usuários ativos cresceram ${(exec.growthWoW * 100).toFixed(1)}% semana sobre semana.`
        : `Atenção: DAU caiu ${(-exec.growthWoW * 100).toFixed(1)}% WoW. Investigar funil e funcionalidades.`,
    severity: exec.growthWoW >= 0.05 ? 'positive' : exec.growthWoW <= -0.05 ? 'warn' : 'info',
    delta: exec.growthWoW,
    metric: 'DAU',
    href: '/usuarios',
  });

  if (exec.stickiness < 0.15) {
    out.push({
      id: 'stickiness-low',
      title: 'Engajamento baixo',
      body: `Stickiness (DAU/MAU) está em ${(exec.stickiness * 100).toFixed(1)}%. Considere campanhas de retenção e push de favoritos.`,
      severity: 'warn',
      href: '/usuarios',
    });
  }

  const topCidade = [...cidades].sort((a, b) => b.growthMoM - a.growthMoM)[0];
  if (topCidade && topCidade.growthMoM > 0.1) {
    out.push({
      id: 'cidade-emergente',
      title: `${topCidade.cidade} em forte expansão`,
      body: `${topCidade.cidade} (${topCidade.orgao}) cresceu ${(topCidade.growthMoM * 100).toFixed(1)}% em buscas no mês.`,
      severity: 'positive',
      delta: topCidade.growthMoM,
      href: '/geo',
    });
  }

  const piorParada = paradas
    .filter((p) => p.acessos > 50)
    .sort((a, b) => b.taxaErro - a.taxaErro)[0];
  if (piorParada && piorParada.taxaErro > 0.15) {
    out.push({
      id: 'parada-falha',
      title: 'Parada com alta taxa de erro',
      body: `${piorParada.paradaNome} apresenta ${(piorParada.taxaErro * 100).toFixed(1)}% de falhas Firebase em ${piorParada.acessos} acessos.`,
      severity: 'critical',
      href: '/paradas',
    });
  }

  const topEmerging = [...linhas].sort((a, b) => b.growthWoW - a.growthWoW)[0];
  if (topEmerging && topEmerging.growthWoW > 0.5) {
    out.push({
      id: 'linha-emergente',
      title: `Linha ${topEmerging.linha} ganhando tração`,
      body: `+${(topEmerging.growthWoW * 100).toFixed(0)}% em buscas WoW em ${topEmerging.cidade}.`,
      severity: 'positive',
      delta: topEmerging.growthWoW,
      href: '/linhas',
    });
  }

  if (anomalies.length > 0) {
    const latest = anomalies[anomalies.length - 1];
    out.push({
      id: 'anomaly-latest',
      title: 'Anomalia recente detectada',
      body: `${latest.description} Em ${latest.date}.`,
      severity: latest.severity === 'critical' ? 'critical' : 'warn',
      href: '/insights',
    });
  }

  return out;
}

function buildCohorts(
  raw: Array<{ cohort_week: string; week_offset: number; users: number }>
): CohortRow[] {
  const idx = new Map<string, Map<number, number>>();
  for (const r of raw) {
    const week =
      typeof r.cohort_week === 'string'
        ? r.cohort_week.slice(0, 10)
        : new Date(r.cohort_week).toISOString().slice(0, 10);
    if (!idx.has(week)) idx.set(week, new Map());
    idx.get(week)!.set(Number(r.week_offset), Number(r.users));
  }
  const cohorts: CohortRow[] = [];
  for (const [cohort, m] of idx) {
    const size = m.get(0) ?? 0;
    if (size === 0) continue;
    const maxOffset = Math.max(...m.keys());
    const retention: number[] = [];
    for (let i = 0; i <= Math.min(maxOffset, 8); i++) {
      retention.push((m.get(i) ?? 0) / size);
    }
    cohorts.push({ cohort, size, retention });
  }
  return cohorts.sort((a, b) => a.cohort.localeCompare(b.cohort)).slice(-12);
}
