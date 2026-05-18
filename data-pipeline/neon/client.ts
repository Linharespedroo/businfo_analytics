import { Pool } from 'pg';
import { pipelineConfig } from '../config';

let pool: Pool | null = null;

export function neon(): Pool {
  if (!pipelineConfig.neon.url) {
    throw new Error('NEON_DATABASE_URL não configurada — enriquecimento ignorado.');
  }
  if (!pool) {
    pool = new Pool({
      connectionString: pipelineConfig.neon.url,
      max: 5,
      idleTimeoutMillis: 30_000,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function neonAvailable(): Promise<boolean> {
  if (!pipelineConfig.neon.url) return false;
  try {
    await neon().query('SELECT 1');
    return true;
  } catch (e) {
    console.warn('[neon] indisponível, prosseguindo sem enriquecimento:', (e as Error).message);
    return false;
  }
}

export async function closeNeon() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
