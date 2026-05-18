# BusInfo Analytics

Dashboard analítico do **BusInfo** — mobilidade urbana focada em transporte público
e rastreamento de ônibus. Combina eventos do **Google Analytics 4** (exportados para
**BigQuery**) com metadados operacionais do **Postgres Neon** do app principal.

> Stack: Next.js 14 (export estático) · TypeScript · Tailwind · shadcn/ui · Apache ECharts · Leaflet · TanStack Query · Zustand.
> Deploy: **GitHub Pages** (gratuito). Pipeline de dados via **GitHub Actions cron**.

---

## Arquitetura

```
┌────────────────────┐    ┌──────────────────┐
│ GA4 → BigQuery     │    │ Neon (Postgres)  │
│ events_*           │    │ linhas, frota,…  │
└──────────┬─────────┘    └────────┬─────────┘
           │                       │
           ▼                       ▼
   ┌──────────────────────────────────────────┐
   │ data-pipeline/run.ts  (GitHub Actions)   │
   │  • 10 queries BQ paralelas               │
   │  • partition pruning + CTE única         │
   │  • enriquecimento Neon (orgão/operador)  │
   │  • transformações + insights + cohorts   │
   └──────────────────┬───────────────────────┘
                      ▼
        public/data/bundle.json (~80–250 KB gzip)
                      ▼
   ┌──────────────────────────────────────────┐
   │ Next.js static site (GitHub Pages)       │
   │  • client cache (TanStack Query)         │
   │  • filtros globais (Zustand persistido)  │
   │  • derivações leves no browser           │
   └──────────────────────────────────────────┘
```

Por que pré-agregar no pipeline e não consultar BQ em tempo real?

- **Custo**: 1 execução/dia versus 1 por visitante. Reduz scans em 99%+.
- **Latência**: o dashboard carrega instantaneamente do CDN do GitHub.
- **Segurança**: nenhuma credencial chega ao browser.
- **Resiliência**: o site continua respondendo se BQ ou Neon estiverem indisponíveis.

---

## Setup local

Requisitos: Node.js ≥ 20.

```bash
./scripts/setup.sh        # instala deps + gera amostra
npm run dev               # http://localhost:3000
```

Para puxar dados reais localmente:

```bash
cp .env.example .env
# preencha GOOGLE_APPLICATION_CREDENTIALS, BQ_PROJECT_ID, NEON_DATABASE_URL
npm run data:refresh
npm run dev
```

---

## Deploy no GitHub Pages

1. Habilite GitHub Pages em **Settings → Pages → Source: GitHub Actions**.

2. Adicione os secrets do repositório (**Settings → Secrets → Actions**):

   | Secret | Descrição |
   | --- | --- |
   | `GOOGLE_APPLICATION_CREDENTIALS_JSON` | Conteúdo JSON da service account com `BigQuery Data Viewer` + `BigQuery Job User` sobre o dataset `analytics_472265609`. |
   | `NEON_DATABASE_URL` | Connection string Postgres do Neon BusInfo (somente leitura recomendado). |

3. O workflow `.github/workflows/data-refresh.yml` roda diariamente às **03:15 BRT**,
   consulta BQ + Neon, commita o `bundle.json` atualizado e dispara o deploy.

   Sem os secrets ele cai para `data:sample` e gera um bundle demo determinístico.

4. O workflow `.github/workflows/deploy.yml` faz o build estático e publica a `out/`
   no GH Pages. O `basePath` é injetado por env (`/businfo_analytics`).

URL final: `https://<user>.github.io/businfo_analytics/`.

---

## Métricas e KPIs

### Visão Executiva
- DAU, WAU, MAU, **stickiness** (DAU/MAU)
- Crescimento WoW / MoM / YoY
- Mix de ações (buscas, detalhes, favoritos, localização, paradas, QR)
- Top-10 linhas, performance por cidade

### Linhas
- Ranking por buscas/detalhes
- Linhas emergentes (maior crescimento WoW, com piso de buscas)
- Conversão `buscar_linha → adicionar_favorito`
- Saldo líquido de favoritos por linha

### Favoritos
- Adicionados, removidos, saldo, taxa de retenção (1 − removidos/adicionados)
- Linhas com maior remoção (sinal de churn)

### Paradas
- Cliques (`tocar_parada`), por fonte (`sptrans`, `emtu`, …)
- Taxa de erro Firebase (`firebase_error`) por parada
- Paradas críticas (alta taxa de erro com volume relevante)

### Geoanálise
- Heatmap (Leaflet + leaflet.heat) sobre eventos `usar_localizacao`
- Crescimento MoM por cidade
- Distribuição de usuários por município

### Localização
- Adoção (eventos/usuários ativos)
- Distribuição de precisão (alta/média/baixa)
- Padrões por hora do dia × dia da semana

### Usuários
- Funil: `buscar_linha → ver_detalhe_linha → adicionar_favorito → filtrar_veiculo`
- Cohort retention semanal (até S+8)
- Novos × recorrentes

### Insights automáticos
- Detecção de anomalias: z-score sobre janela móvel de 14 dias, |z| ≥ 2.5
- Sugestões dinâmicas baseadas em variações reais (cidades emergentes,
  paradas falhando, queda de DAU, etc.)

---

## Eventos rastreados

Mapeados a partir do app **BusInfo**:

| Evento | Params relevantes |
| --- | --- |
| `session_start` | `is_active_user` |
| `buscar_linha` | `linha`, `cidade`, `sentido`, `nome` |
| `ver_detalhe_linha` | `linha`, `cidade`, `sentido` |
| `ver_trilhos` | — |
| `adicionar_favorito` | `linha`, `cidade`, `sentido` |
| `remover_favorito` | `linha`, `cidade`, `sentido` |
| `filtrar_veiculo` | `prefixo`, `linha`, `cidade` |
| `usar_localizacao` | `latitude`, `longitude`, `precisao` |
| `tocar_parada` | `id`, `nome`, `fonte`, `firebase_error`, `error_value` |
| `qr_scan` | `stop_id`, `stop_source` |
| `stop_view` | `stop_id`, `stop_source` |
| `timer_expired` | `stop_id`, `visit_count` |
| `app_store_click` | `store`, `stop_id` |

---

## Otimização de custo BigQuery

| Técnica | Onde |
| --- | --- |
| `_TABLE_SUFFIX BETWEEN @start AND @end` | `data-pipeline/bq/client.ts` + queries |
| CTE única `base` com filtro de `event_name IN UNNEST(@events)` | `data-pipeline/bq/queries.ts` |
| Agregações `COUNTIF` em vez de múltiplas tabelas/queries | todas as queries |
| `LIMIT 5000 ORDER BY RAND()` em pontos geo (amostragem) | `geoPointsSql` |
| Janela `lookbackDays` configurável (default 90) | env `BQ_LOOKBACK_DAYS` |
| Materialização local: 10 queries → 1 JSON. Reuso por todos os clients. | `data-pipeline/run.ts` |
| Single client cache em browser (TanStack Query + force-cache) | `src/lib/data/client.ts` |

Custo estimado: ~10 queries × poucos MB cada, < $0.01 / execução. Considerando uma
execução diária, < $0.30 / mês mesmo com tráfego alto no painel.

---

## Estrutura

```
businfo_analytics/
├── .github/workflows/
│   ├── data-refresh.yml      # cron diário
│   └── deploy.yml            # static deploy
├── data-pipeline/
│   ├── bq/                   # BigQuery client + queries
│   ├── neon/                 # Neon client + enrichment
│   ├── transforms/           # buildBundle + derivações
│   ├── config.ts
│   ├── run.ts                # entrypoint live
│   └── generate-sample.ts    # entrypoint demo (sintético)
├── public/data/              # bundle.json + manifest.json
├── src/
│   ├── app/                  # rotas (next/app)
│   │   ├── page.tsx          # Executivo
│   │   ├── linhas/
│   │   ├── favoritos/
│   │   ├── paradas/
│   │   ├── geo/
│   │   ├── localizacao/
│   │   ├── usuarios/
│   │   └── insights/
│   ├── components/
│   │   ├── ui/               # primitivos shadcn-style
│   │   ├── charts/           # ECharts wrapper, options, KPI tiles
│   │   ├── maps/             # heatmap Leaflet
│   │   └── layout/           # shell + filtros globais + tema
│   ├── lib/
│   │   ├── data/             # loader cacheado
│   │   ├── analytics/        # derivações, anomalias, filtros
│   │   ├── filters/          # store Zustand persistido
│   │   └── utils.ts
│   └── types/                # contratos do bundle
└── scripts/setup.sh
```

---

## Sugestões futuras de evolução

| Categoria | Ideia |
| --- | --- |
| **Modelagem** | Materializar uma tabela diária `analytics.daily_events` no BQ com partição por `data` e clustering por `(cidade, event_name)`. As consultas atuais ficariam ~10× mais baratas. |
| **Funis** | Funil sequencial real (com ordem temporal por sessão) via `LAG` / event-window — atualmente é por usuário único. |
| **Predição** | Forecast simples (Holt-Winters) das séries diárias para 30 dias à frente, com banda de confiança. |
| **Geocoding** | Reverse-geocode dos `usar_localizacao` em bairros via OSM Nominatim (cacheado), permitindo análise por bairro real. |
| **Alertas** | Webhook (Discord/Slack) quando z-score ≥ 4 ou cidade-chave cai > 30% WoW. |
| **A/B** | Suporte a `experiment_id` / `variant` em event_params para análises de testes. |
| **Auth** | Proteção do painel via Cloudflare Access ou login simples (basic auth via CF Worker) — hoje é público porque GH Pages não tem auth nativo. |
| **Dimensões adicionais** | Plataforma (iOS/Android/Web) e versão do app — já presentes no GA4 em `device.*` e `app_info.*`. |
| **Granularidade** | Drill-down por linha → veículo → trajeto via tabela `frota` + telemetria histórica. |

---

## Licença & Avisos

Projeto interno do BusInfo. Os dados consumidos podem conter informações sensíveis
sobre comportamento de usuários — o repo deve permanecer privado se conectado a
dados live, ou usar amostras anonimizadas se público.
