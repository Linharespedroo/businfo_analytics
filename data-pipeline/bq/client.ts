import { BigQuery } from '@google-cloud/bigquery';
import { pipelineConfig } from '../config';

let cached: BigQuery | null = null;

export function bq(): BigQuery {
  if (cached) return cached;
  const { credentialsJson, credentialsPath, projectId, location } = pipelineConfig.bq;

  if (credentialsJson) {
    cached = new BigQuery({
      projectId,
      location,
      credentials: JSON.parse(credentialsJson),
    });
  } else if (credentialsPath) {
    cached = new BigQuery({ projectId, location, keyFilename: credentialsPath });
  } else {
    // Aceita ADC (gcloud auth application-default login).
    cached = new BigQuery({ projectId, location });
  }
  return cached;
}

export interface SuffixRange {
  start: string; // YYYYMMDD
  end: string; // YYYYMMDD
}

export function tableSuffixRange(lookbackDays: number): SuffixRange {
  const now = new Date();
  const end = ymd(now);
  const startDate = new Date(now);
  startDate.setUTCDate(startDate.getUTCDate() - lookbackDays);
  return { start: ymd(startDate), end };
}

function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

export async function runQuery<T = Record<string, unknown>>(
  sql: string,
  params?: Record<string, unknown>
): Promise<T[]> {
  const [job] = await bq().createQueryJob({
    query: sql,
    location: pipelineConfig.bq.location,
    params,
    useLegacySql: false,
  });
  const [rows] = await job.getQueryResults({ maxResults: 200000 });
  return rows as T[];
}
