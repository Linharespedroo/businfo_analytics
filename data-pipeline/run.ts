#!/usr/bin/env tsx
/**
 * Orquestrador do pipeline. Executa em paralelo todas as queries BQ + Neon,
 * monta o bundle e grava em `public/data/bundle.json`.
 *
 * Custo: ~7 queries BQ por execução, cada uma com partition pruning agressivo
 * sobre a janela `BQ_LOOKBACK_DAYS`. Recomenda-se rodar 1× ao dia.
 */
import fs from 'node:fs';
import path from 'node:path';
import { runQuery } from './bq/client';
import {
  dailyMetricsSql,
  hourlyHeatmapSql,
  linhaRankingSql,
  linhaGrowthSql,
  favoritosSql,
  cidadesSql,
  geoPointsSql,
  paradasSql,
  funnelSql,
  cohortSql,
  params,
} from './bq/queries';
import { fetchLinhasMetadata, fetchCidadesMetadata } from './neon/queries';
import { neonAvailable, closeNeon } from './neon/client';
import { buildBundle } from './transforms/build-bundle';
import { pipelineConfig } from './config';

async function main() {
  console.log('▶ businfo-analytics data pipeline');
  console.log(
    `  projeto BQ: ${pipelineConfig.bq.projectId}/${pipelineConfig.bq.dataset}`
  );
  console.log(`  janela: ${pipelineConfig.bq.lookbackDays}d  tz: ${pipelineConfig.bq.timezone}`);

  const p = params();
  const t0 = Date.now();

  const [
    daily,
    hourly,
    linhas,
    linhaGrowth,
    favoritos,
    cidades,
    geoPoints,
    paradas,
    funnelRows,
    cohortsRaw,
  ] = await Promise.all([
    runQuery(dailyMetricsSql(), p).then(r => r as any),
    runQuery(hourlyHeatmapSql(), p).then(r => r as any),
    runQuery(linhaRankingSql(), p).then(r => r as any),
    runQuery(linhaGrowthSql(), p).then(r => r as any),
    runQuery(favoritosSql(), p).then(r => r as any),
    runQuery(cidadesSql(), p).then(r => r as any),
    runQuery(geoPointsSql(5000), p).then(r => r as any),
    runQuery(paradasSql(), p).then(r => r as any),
    runQuery(funnelSql(), p).then(r => r as any),
    runQuery(cohortSql(), p).then(r => r as any),
  ]);

  console.log(`  BQ ok em ${(Date.now() - t0) / 1000}s`);

  let linhasMeta: Awaited<ReturnType<typeof fetchLinhasMetadata>> = [];
  let cidadesMeta: Awaited<ReturnType<typeof fetchCidadesMetadata>> = [];
  if (await neonAvailable()) {
    console.log('  enriquecendo via Neon…');
    [linhasMeta, cidadesMeta] = await Promise.all([
      fetchLinhasMetadata(),
      fetchCidadesMetadata(),
    ]);
  }

  const bundle = buildBundle(
    {
      daily,
      hourly,
      linhas,
      linhaGrowth,
      favoritos,
      cidades,
      geoPoints,
      paradas,
      funnel: funnelRows,
      cohortsRaw,
      source: 'live',
    },
    { linhasMeta, cidadesMeta }
  );

  fs.mkdirSync(pipelineConfig.output.dir, { recursive: true });
  const bundlePath = path.join(pipelineConfig.output.dir, pipelineConfig.output.bundleFile);
  fs.writeFileSync(bundlePath, JSON.stringify(bundle));
  const manifest = {
    generatedAt: bundle.meta.generatedAt,
    pipelineVersion: bundle.meta.pipelineVersion,
    rangeStart: bundle.meta.rangeStart,
    rangeEnd: bundle.meta.rangeEnd,
    source: bundle.meta.source,
    sizeBytes: fs.statSync(bundlePath).size,
  };
  fs.writeFileSync(
    path.join(pipelineConfig.output.dir, pipelineConfig.output.manifestFile),
    JSON.stringify(manifest, null, 2)
  );

  console.log(
    `✓ bundle gerado em ${bundlePath} (${(manifest.sizeBytes / 1024).toFixed(1)} KB)`
  );
  await closeNeon();
}

main().catch((err) => {
  console.error('✗ pipeline falhou:', err);
  process.exit(1);
});
