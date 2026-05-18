/**
 * Queries BigQuery otimizadas. Pontos-chave:
 *
 * 1. _TABLE_SUFFIX BETWEEN — partition pruning agressivo (única forma de reduzir custo
 *    em GA4 events_*).
 * 2. CTE `base` filtra event_name uma única vez por execução e reutiliza para todas as
 *    agregações — evita N scans de tabela.
 * 3. UNNEST(event_params) feito uma vez em ARRAY_AGG ou via subquery indexada por chave.
 * 4. Timezone fixado em America/Sao_Paulo para coerência com o painel.
 */
import { tableSuffixRange } from './client';
import { pipelineConfig } from '../config';

const TARGET_EVENTS = [
  'session_start',
  'first_visit',
  'buscar_linha',
  'ver_detalhe_linha',
  'ver_trilhos',
  'adicionar_favorito',
  'remover_favorito',
  'filtrar_veiculo',
  'usar_localizacao',
  'tocar_parada',
  'qr_scan',
  'stop_view',
  'timer_expired',
  'app_store_click',
];

export function buildContext() {
  const { projectId, dataset, lookbackDays, timezone } = pipelineConfig.bq;
  const range = tableSuffixRange(lookbackDays);
  const tableRef = `\`${projectId}.${dataset}.events_*\``;
  return { tableRef, range, timezone };
}

/**
 * Base CTE — sub-query única que extrai todos os params relevantes uma única vez
 * por evento. Usada como source das demais agregações in-process (após download
 * do resultado de cada query principal). Para reduzir custo BQ, geramos uma série
 * de queries específicas, cada uma com SELECT mínimo e agregando no SQL.
 */
const baseCte = (events: string[]) => `
  WITH base AS (
    SELECT
      PARSE_DATE('%Y%m%d', event_date) AS data,
      TIMESTAMP_MICROS(event_timestamp) AS ts,
      event_name,
      user_pseudo_id,
      is_active_user,
      (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'linha')    AS linha,
      (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'cidade')   AS cidade,
      (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'sentido')  AS sentido,
      (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'prefixo')  AS prefixo,
      (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'precisao') AS precisao,
      (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'id')       AS parada_id,
      (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'nome')     AS parada_nome,
      (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'fonte')    AS fonte,
      (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'firebase_error') AS erro_tipo,
      (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'error_value')    AS erro_detalhe,
      (SELECT COALESCE(ep.value.double_value, ep.value.float_value) FROM UNNEST(event_params) ep WHERE ep.key = 'latitude') AS latitude,
      (SELECT COALESCE(ep.value.double_value, ep.value.float_value) FROM UNNEST(event_params) ep WHERE ep.key = 'longitude') AS longitude
    FROM ${tableRefPlaceholder}
    WHERE _TABLE_SUFFIX BETWEEN @start AND @end
      AND event_name IN UNNEST(@events)
  )
`;

// placeholder substituído em runtime para evitar template noise
const tableRefPlaceholder = '__TABLE_REF__';

function render(sql: string): string {
  const { tableRef } = buildContext();
  return sql.replace(/__TABLE_REF__/g, tableRef);
}

/** Métricas diárias agregadas (DAU, eventos por dia). Um único scan. */
export function dailyMetricsSql() {
  const sql = `
${baseCte(TARGET_EVENTS)}
SELECT
  data,
  COUNT(DISTINCT IF(event_name = 'session_start' AND is_active_user, user_pseudo_id, NULL)) AS users,
  COUNT(DISTINCT IF(event_name = 'first_visit', user_pseudo_id, NULL))                       AS new_users,
  COUNTIF(event_name = 'session_start')                                                      AS sessions,
  COUNT(*)                                                                                   AS events,
  COUNTIF(event_name = 'buscar_linha')                                                       AS buscas,
  COUNTIF(event_name = 'adicionar_favorito')                                                 AS favoritos,
  COUNTIF(event_name = 'ver_detalhe_linha')                                                  AS detalhes,
  COUNTIF(event_name = 'usar_localizacao')                                                   AS localizacoes,
  COUNTIF(event_name = 'tocar_parada')                                                       AS paradas,
  COUNTIF(event_name = 'qr_scan')                                                            AS qr_scans
FROM base
GROUP BY data
ORDER BY data
`;
  return render(sql);
}

/** Heatmap hora × dia da semana, em uma única passagem. */
export function hourlyHeatmapSql() {
  const sql = `
${baseCte(['session_start', 'buscar_linha', 'ver_detalhe_linha', 'adicionar_favorito'])}
SELECT
  MOD(EXTRACT(DAYOFWEEK FROM ts AT TIME ZONE '${pipelineConfig.bq.timezone}') + 5, 7) AS weekday,
  EXTRACT(HOUR FROM ts AT TIME ZONE '${pipelineConfig.bq.timezone}') AS hour,
  COUNT(*) AS value
FROM base
GROUP BY weekday, hour
`;
  return render(sql);
}

/** Ranking de linhas. Calcula buscas, detalhes, favoritados, removidos, únicos por (linha, cidade). */
export function linhaRankingSql() {
  const sql = `
${baseCte(['buscar_linha', 'ver_detalhe_linha', 'adicionar_favorito', 'remover_favorito'])}
SELECT
  linha, cidade,
  COUNTIF(event_name = 'buscar_linha')        AS buscas,
  COUNTIF(event_name = 'ver_detalhe_linha')   AS detalhes,
  COUNTIF(event_name = 'adicionar_favorito')  AS favoritados,
  COUNTIF(event_name = 'remover_favorito')    AS removidos,
  COUNT(DISTINCT user_pseudo_id)              AS usuarios_unicos
FROM base
WHERE linha IS NOT NULL
GROUP BY linha, cidade
HAVING buscas > 0 OR detalhes > 0 OR favoritados > 0
ORDER BY buscas DESC
LIMIT 500
`;
  return render(sql);
}

/** Crescimento por linha (atual vs. 7d anteriores) — single scan via SUMIF condicional. */
export function linhaGrowthSql() {
  const sql = `
${baseCte(['buscar_linha'])}
SELECT
  linha, cidade,
  COUNTIF(data >= DATE_SUB(CURRENT_DATE('${pipelineConfig.bq.timezone}'), INTERVAL 7 DAY))  AS recent,
  COUNTIF(data <  DATE_SUB(CURRENT_DATE('${pipelineConfig.bq.timezone}'), INTERVAL 7 DAY)
           AND data >= DATE_SUB(CURRENT_DATE('${pipelineConfig.bq.timezone}'), INTERVAL 14 DAY)) AS previous
FROM base
WHERE linha IS NOT NULL
GROUP BY linha, cidade
HAVING recent + previous >= 10
`;
  return render(sql);
}

/** Favoritos detalhados. */
export function favoritosSql() {
  const sql = `
${baseCte(['adicionar_favorito', 'remover_favorito'])}
SELECT
  linha, cidade,
  COUNTIF(event_name = 'adicionar_favorito') AS adicionados,
  COUNTIF(event_name = 'remover_favorito')   AS removidos
FROM base
WHERE linha IS NOT NULL
GROUP BY linha, cidade
ORDER BY adicionados DESC
LIMIT 200
`;
  return render(sql);
}

/** Cidades — engajamento por cidade com janelas WoW/MoM. */
export function cidadesSql() {
  const sql = `
${baseCte(['buscar_linha', 'ver_detalhe_linha', 'adicionar_favorito', 'session_start'])}
SELECT
  cidade,
  COUNT(DISTINCT user_pseudo_id) AS usuarios,
  COUNTIF(event_name = 'buscar_linha') AS buscas,
  COUNTIF(event_name = 'ver_detalhe_linha') AS detalhes,
  COUNTIF(event_name = 'adicionar_favorito') AS favoritos,
  COUNTIF(event_name = 'buscar_linha' AND data >= DATE_SUB(CURRENT_DATE('${pipelineConfig.bq.timezone}'), INTERVAL 7 DAY))  AS recent_7d,
  COUNTIF(event_name = 'buscar_linha' AND data <  DATE_SUB(CURRENT_DATE('${pipelineConfig.bq.timezone}'), INTERVAL 7 DAY)
                                       AND data >= DATE_SUB(CURRENT_DATE('${pipelineConfig.bq.timezone}'), INTERVAL 14 DAY)) AS previous_7d,
  COUNTIF(event_name = 'buscar_linha' AND data >= DATE_SUB(CURRENT_DATE('${pipelineConfig.bq.timezone}'), INTERVAL 30 DAY)) AS recent_30d,
  COUNTIF(event_name = 'buscar_linha' AND data <  DATE_SUB(CURRENT_DATE('${pipelineConfig.bq.timezone}'), INTERVAL 30 DAY)
                                       AND data >= DATE_SUB(CURRENT_DATE('${pipelineConfig.bq.timezone}'), INTERVAL 60 DAY)) AS previous_30d
FROM base
WHERE cidade IS NOT NULL
GROUP BY cidade
ORDER BY usuarios DESC
`;
  return render(sql);
}

/** Pontos geográficos para heatmap (amostrados). */
export function geoPointsSql(limit = 5000) {
  const sql = `
${baseCte(['usar_localizacao'])}
SELECT
  latitude AS lat,
  longitude AS lon,
  precisao,
  1 AS weight
FROM base
WHERE latitude IS NOT NULL AND longitude IS NOT NULL
  AND latitude BETWEEN -33 AND -2
  AND longitude BETWEEN -74 AND -34
ORDER BY RAND()
LIMIT ${limit}
`;
  return render(sql);
}

/** Paradas mais acessadas + taxa de erro. */
export function paradasSql() {
  const sql = `
${baseCte(['tocar_parada'])}
SELECT
  parada_id,
  ANY_VALUE(parada_nome) AS parada_nome,
  ANY_VALUE(fonte)       AS fonte,
  COUNT(*)               AS acessos,
  COUNTIF(erro_tipo IS NOT NULL) AS erros,
  ANY_VALUE(IF(erro_tipo IS NOT NULL, erro_detalhe, NULL)) AS ultimo_erro
FROM base
WHERE parada_id IS NOT NULL
GROUP BY parada_id
ORDER BY acessos DESC
LIMIT 200
`;
  return render(sql);
}

/** Funil — usuários únicos em cada passo, encadeados. */
export function funnelSql() {
  const sql = `
${baseCte(['buscar_linha', 'ver_detalhe_linha', 'adicionar_favorito', 'filtrar_veiculo'])}
SELECT
  COUNT(DISTINCT IF(event_name = 'buscar_linha', user_pseudo_id, NULL))       AS s1,
  COUNT(DISTINCT IF(event_name = 'ver_detalhe_linha', user_pseudo_id, NULL))  AS s2,
  COUNT(DISTINCT IF(event_name = 'adicionar_favorito', user_pseudo_id, NULL)) AS s3,
  COUNT(DISTINCT IF(event_name = 'filtrar_veiculo', user_pseudo_id, NULL))    AS s4
FROM base
`;
  return render(sql);
}

/** Cohorts semanais: para cada cohort de aquisição, % retidos N semanas depois. */
export function cohortSql() {
  // primeira sessão de cada usuário define o cohort
  const sql = `
WITH first_seen AS (
  SELECT
    user_pseudo_id,
    MIN(PARSE_DATE('%Y%m%d', event_date)) AS first_day
  FROM ${tableRefPlaceholder}
  WHERE _TABLE_SUFFIX BETWEEN @start AND @end
    AND event_name = 'session_start'
  GROUP BY user_pseudo_id
),
weekly AS (
  SELECT
    fs.user_pseudo_id,
    DATE_TRUNC(fs.first_day, WEEK(MONDAY)) AS cohort_week,
    DATE_DIFF(PARSE_DATE('%Y%m%d', e.event_date), fs.first_day, WEEK) AS week_offset
  FROM first_seen fs
  JOIN ${tableRefPlaceholder} e USING (user_pseudo_id)
  WHERE e._TABLE_SUFFIX BETWEEN @start AND @end
    AND e.event_name = 'session_start'
)
SELECT
  cohort_week,
  week_offset,
  COUNT(DISTINCT user_pseudo_id) AS users
FROM weekly
WHERE week_offset BETWEEN 0 AND 8
GROUP BY cohort_week, week_offset
ORDER BY cohort_week, week_offset
`;
  return render(sql);
}

export const params = () => {
  const { range } = buildContext();
  return { start: range.start, end: range.end, events: TARGET_EVENTS };
};
