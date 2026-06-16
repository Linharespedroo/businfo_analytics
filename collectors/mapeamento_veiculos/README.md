# Coletor de Mapeamento SIM/SPTrans (`main.py`)

Pipeline Python que extrai diariamente o **mapeamento de veículos** do portal
SIM da SPTrans (`http://sim.sptrans.com.br`) — exige autenticação. O JSON
resultante é versionado em `data/mapeamento_veiculos.json` (na raiz do repo).

## Como funciona o login do SIM

O portal é **ASP.NET WebForms** com um detalhe importante: o botão "Entrar" é
uma `<div class="divBtnHeader divBtnEntrar">` decorativa dentro de um
`<a id="entrar" href="javascript:WebForm_DoPostBackWithOptions(...)">`. Quem
realmente envia o formulário é o `<a>`. Reproduzir esse postback com `requests`
puro exigiria parsear `__VIEWSTATE`/`__EVENTVALIDATION` e refazer o
`WebForm_DoPostBackWithOptions` manualmente — frágil a qualquer mudança de
versão do SIM. Por isso o login é feito via **Playwright (Chromium headless)**.

Depois do login, **trocamos para `requests`** para chamar a API: é muito mais
leve para uma resposta que passa de 7 MB descomprimidos.

### O login tem duas telas

1. **Credenciais** — tem `#txtLogin` editável + `#txtSenha`. Detectada pela
   presença de `#txtSenha` visível e habilitado.
2. **Seleção de contexto** — mostra CCI / CCO / Área / Empresa / Garagem. O
   `#txtLogin` continua no DOM mas vem `disabled` e já preenchido com o usuário.
   Detectada por `#ddlEmpresa` presente **ou** `#txtLogin[disabled]`.

Em cada tela, o "Entrar" é o mesmo `<a id="entrar">`. O script aciona ambos.

### Cookies que importam de verdade

Capturados de uma sessão real e verificados como necessários:

| Cookie | Origem | Função |
| --- | --- | --- |
| `simsrv` | balanceador | sticky session — fixa o nó do webfarm. Sem ele, a próxima request pode cair em outro servidor e perder a sessão. |
| `ASP.NET_SessionId` | IIS | sessão ASP.NET (state server). |
| `s11.4.0-1Auth` (ou similar terminado em `Auth`) | aplicação | **token de autenticação** — sem ele a API retorna redirect para login. O prefixo (`s11.4.0-1`) varia com a versão do SIM. |
| `v1140-1mostrarJanelaNovidades`, `V11.4.0-1cookieNovidadesMapa` | UI | flags de modal — opcionais para a API. |
| `_ga*`, `_gid` | GA4 | analytics — irrelevantes. |

O script pega **todos** os cookies do contexto Playwright e replica no
`requests.Session` apontando para o host correto. Não tentamos filtrar por
nome porque o prefixo `s11.4.0-1Auth` muda de versão.

## Endpoint chamado

```
POST {origin}/api/MapeamentoVeiculos/ListarMapeamentoVeiculosLinhaTodos
```

Onde `{origin}` é exatamente o origin em que a página de Mapeamento terminou
de carregar (o subdomínio do webfarm — `v1140.webfarm...` hoje, poderia ser
outro amanhã). Headers que o servidor exige na prática:

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

## Robustez

- **Retry exponencial** (2s → 4s → 8s) em erros de rede e HTTP 5xx.
- **Timeout duplo** no requests: 15s para conectar, 180s para receber.
- **Detecção de sessão expirada**: qualquer 3xx, 401 ou 403 vira
  `SessionExpiredError`, que aciona até `--max-relogin` (default 1) relogins
  do zero antes de desistir.
- **Detecção de mudança de estrutura**: se a tela de credenciais ou a tela de
  contexto não desaparecer após o `Entrar`, ou se o endpoint passar a retornar
  HTML / 404, o script falha com `StructureChangedError` (sai com código
  distinto para facilitar alerta).
- **Diagnósticos**: em qualquer falha do Playwright salva screenshot + HTML
  em `diagnostics/` — o workflow faz upload como artifact. Mensagens de erro
  incluem URL, título e estado dos seletores-chave (`_debug_form_state`).
- **Logs estruturados** com `INFO` por default, `DEBUG` mostrando chaves dos
  cookies e estados intermediários.
- **Validação leve do JSON**: loga as chaves top-level ou o tamanho do array
  para detectar regressões silenciosas no schema.

## Compressão automática

Se o JSON descomprimido passar de **10 MB** (configurável via
`SIM_COMPRESS_THRESHOLD_MB`), o script grava `mapeamento_veiculos.json.gz`
em vez do `.json` e remove a versão antiga — para evitar carregar dois
arquivos no Git ao mesmo tempo.

## Códigos de saída

| Código | Significado |
| --- | --- |
| `0` | Sucesso |
| `2` | Variáveis `SIM_LOGIN`/`SIM_PASSWORD` ausentes |
| `3` | Falha no login (credenciais ou front mudou) |
| `4` | Sessão expirou e excedeu `--max-relogin` |
| `5` | Falha persistente na API (5xx, schema mudou, etc.) |
| `6` | Falha gravando o arquivo |

## Rodando localmente

```bash
# 1. Dependências
pip install -r collectors/mapeamento_veiculos/requirements.txt
python -m playwright install --with-deps chromium

# 2. Credenciais (use .env.local fora do git)
export SIM_LOGIN=trsantos
export SIM_PASSWORD='Sophia2112'

# 3. Coleta normal
python collectors/mapeamento_veiculos/main.py --log-level DEBUG

# 4. Modo "probe" — só loga, imprime cookies e sai
python collectors/mapeamento_veiculos/main.py --probe

# 5. Modo headed (Chromium visível) — útil para debug local
python collectors/mapeamento_veiculos/main.py --headed --log-level DEBUG
```

## Workflow (`.github/workflows/coleta_mapeamento.yml`)

- **Agenda**: `cron: '0 11 * * *'` (08:00 BRT). Editar à vontade.
- **Trigger manual**: `workflow_dispatch` com inputs para nível de log e
  número máximo de relogins.
- **Concorrência**: bloqueia execuções paralelas no mesmo group.
- **Cache**: pip + binários do Playwright (`~/.cache/ms-playwright`).
- **Commit automático**: usa `git add -A data/` (para capturar deleções
  quando trocamos `.json` ↔ `.json.gz`) e faz `push` com 4 tentativas de
  retry/rebase em caso de race.
- **Artifacts**: em falha, faz upload de `diagnostics/` (screenshot + HTML).

## Implantação — passo a passo

1. Criar dois GitHub Secrets em **Settings → Secrets and variables → Actions**:
   - `SIM_LOGIN`
   - `SIM_PASSWORD`
2. Garantir que o token do `GITHUB_TOKEN` tem permissão de escrita no repo
   (default em repos próprios; em organizações pode estar limitado em
   **Settings → Actions → General → Workflow permissions** → "Read and write").
3. Disparar a primeira execução manualmente em **Actions → Coleta Mapeamento
   SPTrans → Run workflow** para validar.
4. A partir daí, o cron diário cuida do resto. O
   `data/mapeamento_veiculos.json` (ou `.json.gz`) será atualizado e
   versionado a cada execução com mudança.

## Limitações conhecidas

- Se a SPTrans mudar a estrutura da tela de login (ID dos campos, classe do
  botão), o login falha com `StructureChangedError` — basta atualizar os
  seletores no topo de `main.py`.
- Captura de mensagens de erro do login é heurística (varre vários seletores
  comuns) — em produção pode precisar de ajuste com base na mensagem real.
- O portal é **HTTP**, não HTTPS — Chromium aceita; alguns proxies
  corporativos podem barrar.
