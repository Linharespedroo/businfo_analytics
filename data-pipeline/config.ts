/**
 * Configuração central do pipeline. Lê env vars uma única vez.
 */
import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { existsSync } from 'node:fs';

const envPath = path.resolve(process.cwd(), '.env');
if (existsSync(envPath)) loadEnv({ path: envPath });

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  return v;
}

export const pipelineConfig = {
  bq: {
    projectId: process.env.BQ_PROJECT_ID || 'lpdev-6b8e0',
    dataset: process.env.BQ_DATASET || 'analytics_472265609',
    location: process.env.BQ_LOCATION || 'US',
    lookbackDays: Number(process.env.BQ_LOOKBACK_DAYS ?? 90),
    timezone: process.env.BQ_TIMEZONE || 'America/Sao_Paulo',
    credentialsJson: process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
    credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  },
  neon: {
    url: process.env.NEON_DATABASE_URL,
  },
  output: {
    dir: path.resolve(process.cwd(), 'public/data'),
    bundleFile: 'bundle.json',
    manifestFile: 'manifest.json',
  },
  version: '1.0.0',
  reqEnv: req,
};
