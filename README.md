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

## Coletor SIM/SPTrans (`src/main.py`)

Pipeline paralelo, escrito em Python, que extrai diariamente o **mapeamento de
veículos** do portal SIM da SPTrans (`http://sim.sptrans.com.br`) e versiona o
JSON resultante em `data/mapeamento_veiculos.json`.

### Como funciona o login do SIM

O portal é **ASP.NET WebForms** com um detalhe importante: o botão "Entrar" é
uma `<div class="divBtnHeader divBtnEntrar">`, **não um `<button>`**. Quem
realmente envia o formulário é um handler JavaScript em cima do `<div>`. Por
causa disso, reproduzir o login com `requests` puro exigiria:

1. Baixar o HTML inicial e extrair `__VIEWSTATE`, `__EVENTVALIDATION` e
   `__VIEWSTATEGENERATOR`.
2. Reconstruir o `__doPostBack(...)` que o handler faria.
3. Repetir a coreografia da **segunda tela de confirmação** (que também tem
   um `<div>` "Entrar").
4. Lidar com a sticky session do balanceador (`simsrv=sN`) que muda o
   subdomínio para algo como `v1140.webfarm.sim.sptrans.com.br`.

Qualquer mudança de versão do SIM quebraria isso. Por isso o login real é
feito via **Playwright (Chromium headless)** — o JavaScript executa
naturalmente e o estado de sessão é populado igualzinho ao de um usuário real.
Depois do login, **trocamos para `requests`** para chamar a API: é muito mais
leve para uma resposta que passa de 7 MB descomprimidos.

### Cookies que importam de verdade

Capturados de uma sessão real e verificados como necessários:

| Cookie | Origem | Função |
| --- | --- | --- |
| `simsrv` | balanceador | sticky session — fixa o nó do webfarm. Sem ele, próxima request pode cair em outro servidor e perder a sessão. |
| `ASP.NET_SessionId` | IIS | sessão ASP.NET (state server). |
| `s11.4.0-1Auth` (ou similar terminado em `Auth`) | aplicação | **token de autenticação** — sem ele a API retorna redirect para login. O prefixo (`s11.4.0-1`) varia com a versão do SIM. |
| `v1140-1mostrarJanelaNovidades`, `V11.4.0-1cookieNovidadesMapa` | UI | flags de modal — opcionais para a API. |
| `_ga*`, `_gid` | GA4 | analytics — irrelevantes. |

O script pega **todos** os cookies do contexto Playwright e replica no
`requests.Session` apontando para o host correto. Não tentamos filtrar por
nome porque o prefixo `s11.4.0-1Auth` muda de versão.

### Endpoint chamado

```
POST {origin}/api/MapeamentoVeiculos/ListarMapeamentoVeiculosLinhaTodos
```

Onde `{origin}` é exatamente o origin em que a página de Mapeamento
terminou de carregar (o subdomínio do webfarm — `v1140.webfarm...` hoje,
poderia ser outro amanhã). Headers que o servidor exige na prática:

```
Content-Type:    application/json; charset=utf-8
X-Requested-With: XMLHttpRequest
Accept:          application/json, text/javascript, */*; q=0.01
Origin:          {origin}
Referer:         {origin}/geo/frmNovoMapeamento.aspx
Accept-Encoding: gzip, deflate
```

Payload (exato — `Content-Length: 57`):

```json
{"filtro":["","","","",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,""]}
```

### Robustez

Implementado em `src/main.py`:

- **Retry exponencial** (2s → 4s → 8s) em erros de rede e HTTP 5xx.
- **Timeout duplo** no requests: 15s para conectar, 180s para receber.
- **Detecção de sessão expirada**: qualquer 3xx, 401 ou 403 vira
  `SessionExpiredError`, que aciona até `--max-relogin` (default 1) relogins
  do zero antes de desistir.
- **Detecção de mudança de estrutura**: se o seletor `#txtLogin` ou
  `div.divBtnEntrar` sumir, ou se o endpoint passar a retornar HTML / 404,
  o script falha com `StructureChangedError` (sai com código distinto para
  facilitar alerta).
- **Diagnósticos**: em qualquer falha do Playwright salva screenshot + HTML
  em `diagnostics/` — o workflow faz upload como artifact.
- **Logs estruturados** com `INFO` por default, `DEBUG` mostrando chaves dos
  cookies e estados intermediários.
- **Validação leve do JSON**: loga as chaves top-level ou o tamanho do
  array, para detectar regressões silenciosas no schema.

### Compressão automática

Se o JSON descomprimido passar de **10 MB** (configurável via
`SIM_COMPRESS_THRESHOLD_MB`), o script grava `mapeamento_veiculos.json.gz`
em vez do `.json` e remove a versão antiga — para evitar carregar dois
arquivos no Git ao mesmo tempo.

### Códigos de saída

| Código | Significado |
| --- | --- |
| `0` | Sucesso |
| `2` | Variáveis `SIM_LOGIN`/`SIM_PASSWORD` ausentes |
| `3` | Falha no login (credenciais ou front mudou) |
| `4` | Sessão expirou e excedeu `--max-relogin` |
| `5` | Falha persistente na API (5xx, schema mudou, etc.) |
| `6` | Falha gravando o arquivo |

### Rodando localmente

```bash
# 1. Dependências
pip install -r requirements.txt
python -m playwright install --with-deps chromium

# 2. Credenciais (use .env.local fora do git)
export SIM_LOGIN=trsantos
export SIM_PASSWORD='Sophia2112'

# 3. Coleta normal
python src/main.py --log-level DEBUG

# 4. Modo "probe" — só loga, imprime cookies e sai
python src/main.py --probe

# 5. Modo headed (Chromium visível) — útil para debug local
python src/main.py --headed --log-level DEBUG
```

### Workflow (`.github/workflows/coleta_mapeamento.yml`)

- **Agenda**: `cron: '0 11 * * *'` (08:00 BRT). Editar à vontade.
- **Trigger manual**: `workflow_dispatch` com inputs para nível de log e
  número máximo de relogins.
- **Concorrência**: bloqueia execuções paralelas no mesmo group.
- **Cache**: pip + binários do Playwright (`~/.cache/ms-playwright`).
- **Commit automático**: usa `git add -A data/` (para capturar deleções
  quando trocamos `.json` ↔ `.json.gz`) e faz `push` com 4 tentativas de
  retry/rebase em caso de race.
- **Artifacts**: em falha, faz upload de `diagnostics/` (screenshot + HTML).

### Implantação — passo a passo

1. Criar dois GitHub Secrets em **Settings → Secrets and variables →
   Actions**:
   - `SIM_LOGIN`
   - `SIM_PASSWORD`
2. Garantir que o token do `GITHUB_TOKEN` tem permissão de escrita no repo
   (default em repos próprios; em organizações pode estar limitado em
   **Settings → Actions → General → Workflow permissions** → "Read and write").
3. Subir os arquivos:
   - `src/main.py`
   - `requirements.txt`
   - `.github/workflows/coleta_mapeamento.yml`
4. Disparar a primeira execução manualmente em **Actions → Coleta
   Mapeamento SPTrans → Run workflow** para validar.
5. A partir daí, o cron diário cuida do resto. O `data/mapeamento_veiculos.json`
   (ou `.json.gz`) será atualizado e versionado a cada execução com mudança.

### Limitações conhecidas

- Se a SPTrans mudar a estrutura da tela de login (ID dos campos, classe do
  botão), o login falha com `StructureChangedError` — basta atualizar os
  seletores no topo de `src/main.py`.
- Captura de mensagens de erro do login é heurística (varre vários seletores
  comuns) — em produção pode precisar de ajuste com base na mensagem real.
- O portal é **HTTP**, não HTTPS — Chromium aceita; alguns proxies
  corporativos podem barrar.

---

## Licença & Avisos

Projeto interno do BusInfo. Os dados consumidos podem conter informações sensíveis
sobre comportamento de usuários — o repo deve permanecer privado se conectado a
dados live, ou usar amostras anonimizadas se público.
