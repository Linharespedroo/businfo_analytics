# Data Pipeline

Scripts TypeScript executados pelo GitHub Actions (ou localmente) que consultam
o BigQuery (GA4) e o Neon (Postgres do BusInfo), aplicam transformações e
gravam o bundle estático consumido pelo dashboard.

## Fluxo

```
GA4 events_* ──┐
               ├─► run.ts ──► transforms/* ──► public/data/bundle.json
Neon BusInfo ──┘                                public/data/manifest.json
```

## Variáveis necessárias

Veja `.env.example` na raiz. No GitHub Actions, configure como **secrets**:

- `GOOGLE_APPLICATION_CREDENTIALS_JSON` — JSON da service account com acesso ao dataset
- `BQ_PROJECT_ID` — `lpdev-6b8e0`
- `BQ_DATASET` — `analytics_472265609`
- `NEON_DATABASE_URL` — connection string Neon
- `BQ_LOOKBACK_DAYS` — janela em dias (recomendado: 90)

## Otimizações aplicadas

1. **Partition pruning** com `_TABLE_SUFFIX BETWEEN '20240101' AND '20240130'`
2. **Filtro de event_name antecipado** em CTE única para evitar múltiplos scans
3. **Materialização local** — uma única query por escopo, resto roda em JS
4. **Cache de manifesto** — só re-executa se passou o `BQ_REFRESH_INTERVAL_HOURS`

## Execução

```bash
npm run data:refresh   # consulta BQ + Neon, gera bundle.json
npm run data:sample    # gera dados sintéticos para desenvolvimento
```
