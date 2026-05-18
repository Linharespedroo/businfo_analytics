/**
 * Carregador único de dados — todos os componentes consomem deste hub.
 * Em produção, os JSONs são gerados pelo data-pipeline e servidos estaticamente
 * em `${NEXT_PUBLIC_DATA_BASE}/bundle.json`.
 *
 * O bundle é cacheado em memória por sessão. Para datasets grandes (futuro),
 * podem ser divididos por escopo e carregados sob demanda.
 */
import type { AnalyticsBundle } from '@/types/analytics';

const DATA_BASE =
  // injected at build time via next.config.mjs
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_DATA_BASE) || '/data';

let cached: Promise<AnalyticsBundle> | null = null;

export function getDataUrl(file: string) {
  return `${DATA_BASE}/${file.replace(/^\//, '')}`;
}

export async function loadBundle(): Promise<AnalyticsBundle> {
  if (!cached) {
    cached = fetch(getDataUrl('bundle.json'), { cache: 'force-cache' }).then((r) => {
      if (!r.ok) throw new Error(`Falha ao carregar bundle.json: ${r.status}`);
      return r.json();
    });
  }
  return cached;
}

export function clearDataCache() {
  cached = null;
}
