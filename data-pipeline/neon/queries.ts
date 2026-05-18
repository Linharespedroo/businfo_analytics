/**
 * Enriquecimento via Postgres Neon — junta cada linha do GA4 com metadados
 * operacionais (órgão, operador, área SPTrans, cidade canônica).
 */
import { neon } from './client';

export interface LinhaMetadata {
  linha: string;
  cidade: string;
  orgao: string;
  operador: string;
  area: string | null;
}

export async function fetchLinhasMetadata(): Promise<LinhaMetadata[]> {
  const sql = `
    SELECT
      cod                                   AS linha,
      cidade,
      CASE
        WHEN cidade ILIKE 'SP%'             THEN 'SPTrans'
        WHEN cidade ILIKE 'EMTU%'           THEN 'EMTU'
        WHEN cidade ILIKE 'RIO%BRT%'        THEN 'BRT Rio'
        WHEN cidade ILIKE 'RIO%'            THEN 'Prefeitura RJ'
        WHEN cidade ILIKE 'BARUERI%'        THEN 'Cittati'
        ELSE COALESCE(cidade, 'Outro')
      END                                   AS orgao,
      COALESCE(empresa, '—')                AS operador,
      CAST(area AS TEXT)                    AS area
    FROM linhas
  `;
  const { rows } = await neon().query<LinhaMetadata>(sql);
  return rows;
}

export interface CidadeMetadata {
  cidade: string;
  orgao: string;
  linhas_count: number;
  frota_count: number | null;
}

export async function fetchCidadesMetadata(): Promise<CidadeMetadata[]> {
  const sql = `
    WITH linhas_por_cidade AS (
      SELECT cidade, COUNT(*) AS linhas_count FROM linhas GROUP BY cidade
    ),
    frota_por_cidade AS (
      SELECT cidade, COUNT(*) AS frota_count FROM frota GROUP BY cidade
    )
    SELECT
      l.cidade,
      CASE
        WHEN l.cidade ILIKE 'SP%'    THEN 'SPTrans'
        WHEN l.cidade ILIKE 'EMTU%'  THEN 'EMTU'
        WHEN l.cidade ILIKE 'RIO%'   THEN 'Rio'
        ELSE 'Outros'
      END AS orgao,
      l.linhas_count,
      f.frota_count
    FROM linhas_por_cidade l
    LEFT JOIN frota_por_cidade f USING (cidade)
  `;
  const { rows } = await neon().query<CidadeMetadata>(sql);
  return rows;
}
