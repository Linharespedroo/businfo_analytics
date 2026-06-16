"""
Coletor de Mapeamento de Veículos — Portal SIM da SPTrans.

Fluxo automatizado:

    1. Playwright (Chromium headless) faz login em ``http://sim.sptrans.com.br/``
       — o botão "Entrar" é uma ``<div>`` com handler JavaScript em cima de um
       formulário ASP.NET WebForms, portanto reproduzir o login com requests
       puro exigiria parsing de ``__VIEWSTATE`` e replay do postback. Playwright
       é mais robusto e tolerante a pequenas mudanças no front.
    2. Após o login, lida com a *segunda tela de confirmação* (segundo
       "Entrar"), também via clique numa ``<div>``.
    3. Navega para ``/geo/frmNovoMapeamento.aspx`` — essa visita é o que torna
       o Referer válido e popula a sessão server-side necessária para a API.
    4. Extrai os cookies (incluindo o sticky ``simsrv`` e o ``...Auth``) e a
       *origin* real (ex.: ``http://v1140.webfarm.sim.sptrans.com.br``) — o
       prefixo do servidor muda entre versões do SIM, então não pode ser
       hard-coded.
    5. Faz POST em ``/api/MapeamentoVeiculos/ListarMapeamentoVeiculosLinhaTodos``
       reproduzindo headers exatos capturados pelo navegador
       (``X-Requested-With``, ``Origin``, ``Referer``, ``Accept``, etc.).
    6. Persiste a resposta em ``data/mapeamento_veiculos.json``. Se o payload
       descomprimido passar do limite (default 10 MB) grava
       ``data/mapeamento_veiculos.json.gz`` no lugar.

Variáveis de ambiente:

    SIM_LOGIN                Obrigatório.
    SIM_PASSWORD             Obrigatório.
    SIM_ENTRY_URL            Default ``http://sim.sptrans.com.br/``.
    SIM_OUTPUT_PATH          Default ``data/mapeamento_veiculos.json``.
    SIM_COMPRESS_THRESHOLD_MB  Default ``10``.
    SIM_DIAGNOSTICS_DIR      Default ``diagnostics`` (screenshot/dump em erro).
    SIM_USER_AGENT           Default UA Chrome moderno; aplicado em Playwright
                             e em requests para evitar divergência de fingerprint.
    LOG_LEVEL                ``DEBUG`` / ``INFO`` / ``WARNING`` / ``ERROR``.

Códigos de saída:

    0  sucesso
    2  variáveis obrigatórias ausentes
    3  falha no login (credenciais / front mudou / sem conectividade)
    4  sessão expirou e excedeu ``--max-relogin``
    5  falha persistente na chamada da API
    6  falha gravando o arquivo de saída
"""

from __future__ import annotations

import argparse
import gzip
import json
import logging
import os
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

import requests
from playwright.sync_api import (
    BrowserContext,
    Page,
    Playwright,
    TimeoutError as PlaywrightTimeoutError,
    sync_playwright,
)

LOG = logging.getLogger("sim-coleta")

# ---------------------------------------------------------------------------
# Configuração (sobrescrita por env)
# ---------------------------------------------------------------------------

ENTRY_URL = os.environ.get("SIM_ENTRY_URL", "http://sim.sptrans.com.br/")
MAPEAMENTO_PATH = "/geo/frmNovoMapeamento.aspx"
API_PATH = "/api/MapeamentoVeiculos/ListarMapeamentoVeiculosLinhaTodos"

# Payload capturado exatamente do navegador (Content-Length: 57).
# 4 strings vazias, 15 zeros, 1 string vazia — não alterar a ordem/tipos.
DEFAULT_PAYLOAD: dict[str, list[Any]] = {
    "filtro": ["", "", "", "", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ""]
}

OUTPUT_PATH = Path(os.environ.get("SIM_OUTPUT_PATH", "data/mapeamento_veiculos.json"))
COMPRESS_THRESHOLD_BYTES = int(
    float(os.environ.get("SIM_COMPRESS_THRESHOLD_MB", "10")) * 1024 * 1024
)
DIAGNOSTICS_DIR = Path(os.environ.get("SIM_DIAGNOSTICS_DIR", "diagnostics"))

# Mesmo UA em Playwright e requests evita que o servidor invalide a sessão
# por divergência de fingerprint.
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0.0.0 Safari/537.36"
)
USER_AGENT = os.environ.get("SIM_USER_AGENT", DEFAULT_USER_AGENT)

# Seletores conhecidos do portal SIM
SEL_LOGIN_INPUT = "#txtLogin"
SEL_PASS_INPUT = "#txtSenha"
SEL_BTN_ENTRAR = "div.divBtnEntrar"

# Timeouts (ms p/ Playwright, s p/ requests)
LOGIN_NAV_TIMEOUT_MS = 60_000
PAGE_LOAD_TIMEOUT_MS = 60_000
SECOND_SCREEN_WAIT_MS = 8_000
API_TIMEOUT_S = 180  # API roda ~7s; margem para picos / re-render server-side


# ---------------------------------------------------------------------------
# Estruturas
# ---------------------------------------------------------------------------


class SessionExpiredError(RuntimeError):
    """Sinaliza que a sessão foi invalidada — exige novo login."""


class StructureChangedError(RuntimeError):
    """Sinaliza que a estrutura da página ou do endpoint mudou."""


@dataclass
class SessionData:
    cookies: dict[str, str]
    base_url: str  # ex.: "http://v1140.webfarm.sim.sptrans.com.br"
    user_agent: str
    landed_url: str = ""  # URL final após login (debug)
    extra: dict[str, Any] = field(default_factory=dict)

    def cookie_summary(self) -> str:
        keys = sorted(self.cookies)
        # Não loga valores — alguns são tokens longos sensíveis.
        return ", ".join(keys)


# ---------------------------------------------------------------------------
# Login (Playwright)
# ---------------------------------------------------------------------------


def _origin_of(url: str) -> str:
    p = urlparse(url)
    return f"{p.scheme}://{p.netloc}"


def _save_diagnostics(page: Page, prefix: str) -> None:
    """Tira screenshot + HTML pra ajudar a depurar erros em CI."""
    try:
        DIAGNOSTICS_DIR.mkdir(parents=True, exist_ok=True)
        ts = int(time.time())
        png = DIAGNOSTICS_DIR / f"{prefix}-{ts}.png"
        html = DIAGNOSTICS_DIR / f"{prefix}-{ts}.html"
        page.screenshot(path=str(png), full_page=True)
        html.write_text(page.content(), encoding="utf-8")
        LOG.info("Diagnóstico salvo: %s | %s", png, html)
    except Exception as exc:  # noqa: BLE001
        LOG.warning("Não foi possível salvar diagnóstico: %s", exc)


def _click_entrar(page: Page) -> None:
    """Aciona o postback do botão "Entrar".

    O markup real é ``<a id="entrar" href="javascript:WebForm_DoPostBack...">``
    com um ``<div class="divBtnEntrar">`` decorativo dentro. Clicar só no
    ``<div>`` nem sempre dispara o handler do ``<a>`` — então preferimos o
    ``<a>``, com fallback direto para o postback ASP.NET via ``evaluate``.
    """

    link = page.query_selector("#entrar")
    if link is not None:
        try:
            link.scroll_into_view_if_needed(timeout=3_000)
            link.click(timeout=5_000)
            return
        except Exception as exc:  # noqa: BLE001
            LOG.debug("Clique em <a id='entrar'> falhou (%s) — tentando postback direto", exc)

    # Fallback 1: dispara o helper do próprio WebForms
    try:
        page.evaluate(
            "WebForm_DoPostBackWithOptions(new WebForm_PostBackOptions("
            "'entrar', '', true, '', '', false, true))"
        )
        return
    except Exception as exc:  # noqa: BLE001
        LOG.debug("WebForm_DoPostBackWithOptions falhou (%s) — tentando __doPostBack", exc)

    # Fallback 2: chama __doPostBack direto (sem validação)
    try:
        page.evaluate("__doPostBack('entrar', '')")
        return
    except Exception as exc:  # noqa: BLE001
        LOG.debug("__doPostBack falhou (%s) — tentando clicar no <div>", exc)

    # Fallback 3: clique no <div> decorativo (versões antigas)
    btn = page.locator(SEL_BTN_ENTRAR).first
    btn.scroll_into_view_if_needed(timeout=3_000)
    btn.click(timeout=5_000)


def _extract_login_error(page: Page) -> Optional[str]:
    """Tenta extrair mensagem de erro do form de login."""
    candidates = [
        "#lblMsg",
        "#lblErro",
        ".lblErro",
        ".erroLogin",
        "[id*='Erro']",
        "[id*='erro']",
        "[class*='erro']",
        ".labelError",
    ]
    for sel in candidates:
        try:
            for el in page.query_selector_all(sel):
                txt = (el.text_content() or "").strip()
                if txt:
                    return txt[:200]
        except Exception:  # noqa: BLE001
            continue
    return None


def _has_credentials_form(page: Page) -> bool:
    """1ª tela do SIM: campo de senha visível e habilitado."""
    try:
        el = page.query_selector(SEL_PASS_INPUT)
        if el is None or not el.is_visible():
            return False
        try:
            return not el.is_disabled()
        except Exception:  # noqa: BLE001
            return True
    except Exception:  # noqa: BLE001
        return False


def _has_context_form(page: Page) -> bool:
    """2ª tela do SIM: ``txtLogin`` desabilitado + selects de contexto.

    Sinais positivos: ``#ddlEmpresa`` presente, OU ``#txtLogin`` existe e está
    com ``disabled``. Note que ``txtLogin`` continua no DOM nessa tela, só que
    em modo read-only — foi o que me enganou na primeira versão da heurística.
    """
    try:
        empresa = page.query_selector("#ddlEmpresa")
        if empresa is not None and empresa.is_visible():
            return True
    except Exception:  # noqa: BLE001
        pass
    try:
        login_el = page.query_selector(SEL_LOGIN_INPUT)
        if login_el is None or not login_el.is_visible():
            return False
        try:
            return login_el.is_disabled()
        except Exception:  # noqa: BLE001
            return False
    except Exception:  # noqa: BLE001
        return False


def _debug_form_state(page: Page) -> str:
    """Resumo rápido do que o navegador está mostrando — útil em erro."""
    parts: list[str] = [f"url={page.url}"]
    try:
        parts.append(f"title={page.title()!r}")
    except Exception:  # noqa: BLE001
        pass
    for sel in (SEL_LOGIN_INPUT, SEL_PASS_INPUT, "#ddlEmpresa", "#entrar", SEL_BTN_ENTRAR):
        try:
            el = page.query_selector(sel)
            if el is None:
                parts.append(f"{sel}=absent")
            else:
                vis = el.is_visible()
                disabled = ""
                try:
                    disabled = " disabled" if el.is_disabled() else ""
                except Exception:  # noqa: BLE001
                    pass
                parts.append(f"{sel}=visible={vis}{disabled}")
        except Exception:  # noqa: BLE001
            parts.append(f"{sel}=err")
    return " | ".join(parts)



def login_with_playwright(
    login: str,
    password: str,
    *,
    headless: bool = True,
    pw: Optional[Playwright] = None,
) -> SessionData:
    """Faz login via Playwright e devolve cookies + origin da sessão."""

    own_pw = pw is None
    pw_ctx = pw or sync_playwright().start()
    browser = None
    context: Optional[BrowserContext] = None
    try:
        browser = pw_ctx.chromium.launch(
            headless=headless,
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = browser.new_context(
            user_agent=USER_AGENT,
            locale="pt-BR",
            timezone_id="America/Sao_Paulo",
            ignore_https_errors=True,
            viewport={"width": 1366, "height": 768},
        )
        context.set_default_timeout(PAGE_LOAD_TIMEOUT_MS)
        context.set_default_navigation_timeout(LOGIN_NAV_TIMEOUT_MS)

        page = context.new_page()
        page.on(
            "pageerror",
            lambda exc: LOG.debug("JS pageerror: %s", exc),
        )
        page.on(
            "requestfailed",
            lambda req: LOG.debug(
                "Request falhou: %s %s — %s",
                req.method,
                req.url,
                getattr(req.failure, "error_text", req.failure),
            ),
        )

        LOG.info("Acessando %s", ENTRY_URL)
        page.goto(ENTRY_URL, wait_until="domcontentloaded")

        # 1ª tela: credenciais — esperamos o CAMPO DE SENHA, que só existe
        # nessa tela. Usar #txtLogin não serve: ele continua no DOM (disabled)
        # na 2ª tela de seleção de contexto.
        try:
            page.wait_for_selector(SEL_PASS_INPUT, state="visible", timeout=15_000)
        except PlaywrightTimeoutError as exc:
            _save_diagnostics(page, "no-credentials-form")
            raise StructureChangedError(
                f"Campo de senha {SEL_PASS_INPUT!r} não apareceu — front pode ter mudado. "
                f"Estado: {_debug_form_state(page)}"
            ) from exc

        LOG.info(
            "Tela de credenciais detectada — preenchendo (login=%s***) | %s",
            login[:2],
            _debug_form_state(page),
        )
        page.fill(SEL_LOGIN_INPUT, login)
        page.fill(SEL_PASS_INPUT, password)

        LOG.info("Acionando 'Entrar' (1ª tela)")
        _click_entrar(page)

        # Espera SAIR da tela de credenciais: o #txtSenha desaparece ou some
        # de visibilidade após o postback. Se ficar travado aqui, o login
        # falhou (credenciais inválidas, validação client-side, etc.).
        try:
            page.wait_for_function(
                """() => {
                    const el = document.querySelector('#txtSenha');
                    return !el || el.offsetParent === null;
                }""",
                timeout=LOGIN_NAV_TIMEOUT_MS,
            )
        except PlaywrightTimeoutError as exc:
            err = _extract_login_error(page) or "(sem mensagem específica)"
            _save_diagnostics(page, "stuck-on-credentials")
            raise RuntimeError(
                f"Login falhou na 1ª tela — campo de senha ainda visível. "
                f"Erro reportado: {err}. Estado: {_debug_form_state(page)}"
            ) from exc

        try:
            page.wait_for_load_state("networkidle", timeout=PAGE_LOAD_TIMEOUT_MS)
        except PlaywrightTimeoutError:
            LOG.debug("networkidle não alcançado pós-1ºclique (segue)")

        LOG.info("Saiu da tela de credenciais — %s", _debug_form_state(page))

        # 2ª tela: seleção de contexto (CCI/CCO/Área/Empresa/Garagem).
        # Os defaults já vêm preenchidos para o usuário, então só re-acionamos
        # o "Entrar" para confirmar.
        if _has_context_form(page):
            LOG.info("Detectada 2ª tela (contexto) — acionando 'Entrar' novamente")
            _click_entrar(page)

            try:
                page.wait_for_function(
                    """() => {
                        const dd = document.querySelector('#ddlEmpresa');
                        const tx = document.querySelector('#txtLogin');
                        const sem_empresa = !dd || dd.offsetParent === null;
                        const tx_libre = !tx || !tx.disabled;
                        return sem_empresa && tx_libre;
                    }""",
                    timeout=LOGIN_NAV_TIMEOUT_MS,
                )
            except PlaywrightTimeoutError as exc:
                err = _extract_login_error(page) or "(sem mensagem específica)"
                _save_diagnostics(page, "stuck-on-context")
                raise RuntimeError(
                    f"Login falhou na 2ª tela — selects de contexto ainda visíveis. "
                    f"Erro reportado: {err}. Estado: {_debug_form_state(page)}"
                ) from exc

            try:
                page.wait_for_load_state("networkidle", timeout=PAGE_LOAD_TIMEOUT_MS)
            except PlaywrightTimeoutError:
                LOG.debug("networkidle não alcançado pós-2ºclique (segue)")

            LOG.info("Saiu da 2ª tela — %s", _debug_form_state(page))
        else:
            LOG.info("Nenhuma 2ª tela detectada — login em etapa única")

        # Sanidade final: não pode mais ter nem credenciais nem contexto.
        if _has_credentials_form(page) or _has_context_form(page):
            err = _extract_login_error(page) or "(sem mensagem específica)"
            _save_diagnostics(page, "login-failed")
            raise RuntimeError(
                f"Login não finalizou — ainda em tela de auth/contexto. "
                f"Erro reportado: {err}. Estado: {_debug_form_state(page)}"
            )

        LOG.info("Autenticado — %s", _debug_form_state(page))

        # Navega para a página de Mapeamento. Usa a origin atual (servidor
        # pode ser sim.sptrans.com.br ou um nó de webfarm como v1140.*).
        landed_origin = _origin_of(page.url)
        mapeamento_url = landed_origin + MAPEAMENTO_PATH
        LOG.info("Navegando para %s", mapeamento_url)
        page.goto(mapeamento_url, wait_until="domcontentloaded")
        try:
            page.wait_for_load_state("networkidle", timeout=PAGE_LOAD_TIMEOUT_MS)
        except PlaywrightTimeoutError:
            LOG.warning("Página de Mapeamento não chegou a networkidle (ok)")

        if _has_credentials_form(page) or _has_context_form(page):
            _save_diagnostics(page, "mapeamento-redirected-to-login")
            raise SessionExpiredError(
                f"Mapeamento redirecionou para tela de login/contexto — "
                f"sessão sem permissão. Estado: {_debug_form_state(page)}"
            )

        # Em algumas versões a página final só fica disponível dentro de um
        # iframe. Pegamos a origin do frame que mais combina (path bate com
        # MAPEAMENTO_PATH), com fallback no main frame.
        final_url = page.url
        for frame in page.frames:
            if frame.url and MAPEAMENTO_PATH in frame.url:
                final_url = frame.url
                break

        base_url = _origin_of(final_url)

        cookies_list = context.cookies()
        cookies = {c["name"]: c["value"] for c in cookies_list}

        # Heurística: a presença de um cookie com sufixo "Auth" é um forte
        # indício de que o login deu certo (ex.: s11.4.0-1Auth=...).
        has_auth = any(name.lower().endswith("auth") for name in cookies)
        if not has_auth:
            LOG.warning(
                "Nenhum cookie *Auth encontrado — possível login parcial. "
                "Cookies: %s",
                ", ".join(sorted(cookies)),
            )

        LOG.info(
            "Login OK — base=%s | %d cookies (%s)",
            base_url,
            len(cookies),
            ", ".join(sorted(cookies)),
        )

        return SessionData(
            cookies=cookies,
            base_url=base_url,
            user_agent=USER_AGENT,
            landed_url=final_url,
            extra={"has_auth_cookie": has_auth},
        )
    except Exception:
        if context is not None:
            try:
                for p in context.pages:
                    _save_diagnostics(p, "login-exception")
            except Exception:  # noqa: BLE001
                pass
        raise
    finally:
        if context is not None:
            try:
                context.close()
            except Exception:  # noqa: BLE001
                pass
        if browser is not None:
            try:
                browser.close()
            except Exception:  # noqa: BLE001
                pass
        if own_pw:
            try:
                pw_ctx.stop()
            except Exception:  # noqa: BLE001
                pass


# ---------------------------------------------------------------------------
# Chamada à API (requests)
# ---------------------------------------------------------------------------


def _build_session(session_data: SessionData) -> requests.Session:
    s = requests.Session()
    base_netloc = urlparse(session_data.base_url).netloc
    base_host = base_netloc.split(":")[0]
    for name, val in session_data.cookies.items():
        # Não filtramos por domínio: replicamos o cookie no host do API.
        # Isso evita perder cookies de domínio mais geral (.sptrans.com.br).
        s.cookies.set(name, val, domain=base_host, path="/")
    return s


def call_mapeamento_api(
    session_data: SessionData,
    *,
    retries: int = 3,
    payload: Optional[dict] = None,
) -> bytes:
    """POST na API de mapeamento. Devolve bytes do JSON decodificado."""

    payload = payload or DEFAULT_PAYLOAD
    api_url = session_data.base_url + API_PATH
    referer = session_data.base_url + MAPEAMENTO_PATH

    headers = {
        "User-Agent": session_data.user_agent,
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json; charset=utf-8",
        "X-Requested-With": "XMLHttpRequest",
        "Origin": session_data.base_url,
        "Referer": referer,
        "Connection": "keep-alive",
    }
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")

    s = _build_session(session_data)
    last_exc: Optional[Exception] = None

    for attempt in range(1, retries + 1):
        LOG.info("POST %s — tentativa %d/%d", api_url, attempt, retries)
        t0 = time.monotonic()
        try:
            resp = s.post(
                api_url,
                data=body,
                headers=headers,
                timeout=(15, API_TIMEOUT_S),
                allow_redirects=False,
            )
        except (requests.Timeout, requests.ConnectionError) as exc:
            last_exc = exc
            wait_s = 2 ** attempt
            LOG.warning(
                "Erro de rede (%s) — retry em %ds", exc.__class__.__name__, wait_s
            )
            time.sleep(wait_s)
            continue

        elapsed = time.monotonic() - t0
        ct = resp.headers.get("Content-Type", "")
        LOG.info(
            "Resposta HTTP %d em %.2fs | CT=%s | %s bytes",
            resp.status_code,
            elapsed,
            ct,
            len(resp.content),
        )

        if resp.status_code in (301, 302, 303, 307, 308):
            loc = resp.headers.get("Location", "")
            raise SessionExpiredError(
                f"Redirect inesperado p/ {loc!r} (HTTP {resp.status_code}) — sessão provavelmente expirou"
            )

        if resp.status_code in (401, 403):
            raise SessionExpiredError(
                f"HTTP {resp.status_code} — sessão sem autorização"
            )

        if resp.status_code == 404:
            raise StructureChangedError(
                f"HTTP 404 em {API_PATH} — endpoint pode ter mudado"
            )

        if 500 <= resp.status_code < 600:
            last_exc = requests.HTTPError(f"HTTP {resp.status_code}", response=resp)
            if attempt < retries:
                wait_s = 2 ** attempt
                LOG.warning("HTTP %d — retry em %ds", resp.status_code, wait_s)
                time.sleep(wait_s)
                continue
            raise last_exc

        if resp.status_code != 200:
            raise RuntimeError(
                f"HTTP {resp.status_code} inesperado — body[:200]={resp.text[:200]!r}"
            )

        if "application/json" not in ct.lower():
            # Pode ter caído numa página de erro / login HTML
            snippet = (resp.text or "")[:300]
            raise StructureChangedError(
                f"Resposta não-JSON (CT={ct!r}). Trecho: {snippet!r}"
            )

        try:
            parsed = resp.json()
        except ValueError as exc:
            raise StructureChangedError(f"JSON inválido: {exc}") from exc

        # Sanidade leve sobre a forma do retorno — sem amarrar demais nas
        # chaves, mas log estruturado caso o schema mude no futuro.
        if isinstance(parsed, dict):
            LOG.info("JSON OK — chaves top-level: %s", sorted(parsed.keys()))
        elif isinstance(parsed, list):
            LOG.info("JSON OK — array com %d itens", len(parsed))
        else:
            LOG.warning("JSON OK mas tipo inesperado: %s", type(parsed).__name__)

        return resp.content

    raise RuntimeError(f"Todas as {retries} tentativas falharam") from last_exc


# ---------------------------------------------------------------------------
# Persistência
# ---------------------------------------------------------------------------


def save_output(payload: bytes, target: Path) -> Path:
    """Grava payload em ``target`` (ou ``target.gz`` se passar do limite)."""

    target.parent.mkdir(parents=True, exist_ok=True)
    gz_path = target.with_suffix(target.suffix + ".gz")
    size_mb = len(payload) / 1024 / 1024

    if len(payload) > COMPRESS_THRESHOLD_BYTES:
        LOG.info(
            "Payload %.2f MB > %.2f MB → comprimindo para %s",
            size_mb,
            COMPRESS_THRESHOLD_BYTES / 1024 / 1024,
            gz_path.name,
        )
        with gzip.open(gz_path, "wb", compresslevel=9) as f:
            f.write(payload)
        # Remove versão sem comprimir, se existia
        if target.exists():
            target.unlink()
            LOG.info("Removido %s (substituído pelo .gz)", target.name)
        LOG.info(
            "Gravado %s (%.2f MB → %.2f MB comprimido)",
            gz_path,
            size_mb,
            gz_path.stat().st_size / 1024 / 1024,
        )
        return gz_path

    LOG.info("Gravando %s (%.2f MB)", target, size_mb)
    target.write_bytes(payload)
    if gz_path.exists():
        gz_path.unlink()
        LOG.info("Removido %s (substituído pelo plain)", gz_path.name)
    return target


# ---------------------------------------------------------------------------
# Logging / CLI
# ---------------------------------------------------------------------------


def setup_logging(level: str = "INFO") -> None:
    logging.basicConfig(
        level=level.upper(),
        format="%(asctime)s %(levelname)-7s %(name)s | %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
        stream=sys.stdout,
    )


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Coletor de Mapeamento de Veículos — Portal SIM SPTrans"
    )
    p.add_argument("--log-level", default=os.environ.get("LOG_LEVEL", "INFO"))
    p.add_argument("--retries-api", type=int, default=3, help="Retries na chamada da API")
    p.add_argument(
        "--max-relogin",
        type=int,
        default=1,
        help="Quantas vezes refazer o login se a sessão expirar (default 1)",
    )
    p.add_argument(
        "--headed",
        action="store_true",
        help="Roda o Chromium com janela visível (útil para debug local)",
    )
    p.add_argument(
        "--probe",
        action="store_true",
        help="Faz só o login e imprime descoberta (cookies, base URL) sem chamar a API",
    )
    return p.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> int:
    args = parse_args(argv)
    setup_logging(args.log_level)

    login = os.environ.get("SIM_LOGIN", "").strip()
    password = os.environ.get("SIM_PASSWORD", "").strip()
    if not login or not password:
        LOG.error(
            "Variáveis SIM_LOGIN e SIM_PASSWORD são obrigatórias "
            "(configure como GitHub Secrets em produção)."
        )
        return 2

    LOG.info(
        "Início — login=%s*** | output=%s | threshold=%.1f MB | UA=%s",
        login[:2],
        OUTPUT_PATH,
        COMPRESS_THRESHOLD_BYTES / 1024 / 1024,
        USER_AGENT,
    )

    session_data: Optional[SessionData] = None
    payload: Optional[bytes] = None

    # max_relogin=1 → 1 login inicial + até 1 relogin se a sessão expirar.
    for attempt in range(args.max_relogin + 1):
        try:
            session_data = login_with_playwright(
                login, password, headless=not args.headed
            )
        except StructureChangedError as exc:
            LOG.error("Estrutura da página de login mudou: %s", exc)
            return 3
        except Exception as exc:  # noqa: BLE001
            LOG.exception("Falha no login: %s", exc)
            return 3

        if args.probe:
            LOG.info("=== PROBE MODE ===")
            LOG.info("base_url=%s", session_data.base_url)
            LOG.info("landed_url=%s", session_data.landed_url)
            LOG.info("cookies=%s", session_data.cookie_summary())
            LOG.info("extra=%s", session_data.extra)
            return 0

        try:
            payload = call_mapeamento_api(
                session_data, retries=args.retries_api
            )
            break
        except SessionExpiredError as exc:
            LOG.warning("Sessão expirou: %s", exc)
            if attempt < args.max_relogin:
                LOG.info("Refazendo login (tentativa %d)", attempt + 2)
                continue
            LOG.error("Excedeu --max-relogin=%d", args.max_relogin)
            return 4
        except StructureChangedError as exc:
            LOG.error("Endpoint da API mudou: %s", exc)
            return 5
        except Exception as exc:  # noqa: BLE001
            LOG.exception("Falha persistente na API: %s", exc)
            return 5

    if payload is None:  # defensivo — não deveria acontecer
        return 5

    try:
        final = save_output(payload, OUTPUT_PATH)
    except Exception as exc:  # noqa: BLE001
        LOG.exception("Falha gravando saída: %s", exc)
        return 6

    LOG.info(
        "Concluído com sucesso — arquivo final: %s (%.2f MB on-disk)",
        final,
        final.stat().st_size / 1024 / 1024,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
