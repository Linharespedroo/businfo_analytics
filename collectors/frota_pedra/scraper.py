#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Coletor de frota SIM/SPTrans (Pedra Eletrônica).

Cadeia de requisições (sem autenticação):
  1) sisGerReg.asp?codEmp&codArea&view=0
        -> HTML da empresa; descobre garagens (codGar) e a base 'busca='.
  2) sisGerReg_linhas.asp?...&view=0
        -> lista COMPLETA das linhas da garagem (uma tabela, sem paginação):
           código da linha (svlincodigo) + tplinid (sufixo após a "/").
  3) sisGerReg_linhas.asp?...&busca=1&view=1&linCod=<COD>
        -> bloco .carros da linha, com codGar/codPGar/svlincodigo/tplinid.
  4) sisGerReg_carrosLinha.asp?codGar&codPGar&svlincodigo&tplinid&view=1
        -> veículos da linha (prefixo, sigla, modelo, AVL).

Saída: data/frota.json (consolidado, sobrescrito a cada execução).
"""

import asyncio
import html
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx

BASE = "http://sim.sptrans.com.br/Pedra/ASP"
DELAY = 0.3          # intervalo mínimo entre requisições
CONCURRENCY = 5      # requisições simultâneas
TIMEOUT = 30
RETRIES = 3
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:151.0) "
      "Gecko/20100101 Firefox/151.0")

# Layout do repo: collectors/frota_pedra/scraper.py → REPO_ROOT é parents[1].
ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parents[1]
OUT = REPO_ROOT / "data" / "frota.json"
EMPRESAS_PATH = ROOT / "empresas.json"

# ---------------------------------------------------------------- regex

# Garagens dentro do HTML da empresa (atributo busca='sisGerReg_linhas.asp?...').
# Captura codGar e codEmp; o nome vem no <span> seguinte.
RE_GARAGEM = re.compile(
    r"sisGerReg_linhas\.asp\?[^'\"]*?codGar=(\d+)[^'\"]*?codEmp=(\d+)[^'\"]*?busca=1",
    re.I,
)
RE_GAR_NOME = re.compile(
    r"sisGerReg_linhas\.asp\?[^'\"]*?codGar=(\d+)[^>]*?>.*?<span>\s*(.*?)\s*</span>",
    re.I | re.S,
)

# view=0: lista de linhas. Cada <a linha='106A' class='btBusca'> ... <b>106A/10</b>
RE_LINHA_ITEM = re.compile(
    r"linha='([^']+)'\s+class='btBusca'(.*?)</a>", re.S
)
RE_LINHA_COD = re.compile(r"<b>(?:.*?)([0-9A-Za-z]{3,5})/(\d+)</b>", re.S)

# view=1 (busca=1&linCod=...): bloco .carros com os 4 parâmetros.
RE_CARROS = re.compile(
    r"class='carros'\s+codGar='(\d+)'\s+codPGar='(\d+)'"
    r"\s+svlincodigo='([^']+)'\s+tplinid='(\d+)'",
    re.I,
)

# Veículos (sisGerReg_carrosLinha.asp)
RE_VEIC = re.compile(
    r"<div id='divInfo_(\d+)_\d+'[^>]*?infos='(.*?)''>([^<]*)<br", re.S
)
RE_AVL = re.compile(r"AVL:</b>\s*(\d+)", re.I)
RE_MODELO = re.compile(r"Modelo:</b>\s*([^<]+)", re.I)
RE_TRANSM = re.compile(r"transmiss[^<]*</b>\s*([^<]+)", re.I)


# ---------------------------------------------------------------- http

class Client:
    def __init__(self):
        self._sem = asyncio.Semaphore(CONCURRENCY)
        self._lock = asyncio.Lock()
        self._http = httpx.AsyncClient(
            timeout=TIMEOUT,
            headers={
                "User-Agent": UA,
                "Accept": "*/*",
                "Accept-Language": "pt-BR,pt;q=0.9",
                "X-Requested-With": "XMLHttpRequest",
            },
            follow_redirects=True,
        )

    async def get(self, url: str) -> str | None:
        async with self._sem:
            for attempt in range(1, RETRIES + 1):
                try:
                    r = await self._http.get(url)
                    r.raise_for_status()
                    async with self._lock:
                        await asyncio.sleep(DELAY)
                    return r.text
                except Exception as e:  # noqa: BLE001
                    if attempt == RETRIES:
                        print(f"  ! falha {url} -> {e}", file=sys.stderr)
                        return None
                    await asyncio.sleep(DELAY * attempt)
        return None

    async def aclose(self):
        await self._http.aclose()


# ---------------------------------------------------------------- parsers

def parse_garagens(html_txt: str, cod_emp: int):
    """Retorna {codGar: nome} das garagens da empresa."""
    nomes = {g: html.unescape(n).strip()
             for g, n in RE_GAR_NOME.findall(html_txt)}
    out = {}
    for cod_gar, emp in RE_GARAGEM.findall(html_txt):
        if int(emp) != cod_emp:
            continue
        out.setdefault(cod_gar, nomes.get(cod_gar, ""))
    return out


def parse_lista_linhas(html_txt: str):
    """view=0: retorna lista de {linCod, svlincodigo, tplinid} (todas as linhas)."""
    linhas, seen = [], set()
    for m in RE_LINHA_ITEM.finditer(html_txt):
        lin_cod = m.group(1)
        cod = RE_LINHA_COD.search(m.group(2))
        if not cod:
            continue
        sv, tp = cod.group(1), cod.group(2)
        k = (sv, tp)
        if k in seen:
            continue
        seen.add(k)
        linhas.append({"linCod": lin_cod, "svlincodigo": sv, "tplinid": tp})
    return linhas


def parse_carros_params(html_txt: str):
    """view=1&busca=1: extrai codGar/codPGar/svlincodigo/tplinid do bloco .carros."""
    m = RE_CARROS.search(html_txt)
    if not m:
        return None
    return {"codGar": m.group(1), "codPGar": m.group(2),
            "svlincodigo": m.group(3), "tplinid": m.group(4)}


def parse_veiculos(txt: str):
    veics = []
    for prefixo, infos, nome in RE_VEIC.findall(txt):
        nome = nome.strip()
        sigla_nome = nome.split(" ", 1)[0] if " " in nome else ""
        avl = RE_AVL.search(infos)
        modelo = RE_MODELO.search(infos)
        modelo_txt = html.unescape(modelo.group(1).strip()) if modelo else ""
        m = re.match(r"(.*?)\s*\(([^)]+)\)\s*$", modelo_txt)
        if m:
            modelo_extenso, modelo_sigla = m.group(1).strip(), m.group(2).strip()
        else:
            modelo_extenso, modelo_sigla = modelo_txt, sigla_nome
        transm = RE_TRANSM.search(infos)
        veics.append({
            "prefixo": prefixo,
            "sigla": modelo_sigla or sigla_nome,
            "modelo": modelo_extenso,
            "avl": avl.group(1) if avl else None,
            "acessivel": "acessibilidade.jpg" in infos,
            "ultima_transmissao": transm.group(1).strip() if transm else None,
        })
    return veics


# ---------------------------------------------------------------- pipeline

async def coleta_linha(cli: Client, emp: dict, cod_gar: str,
                       gar_nome: str, lin: dict):
    """Passos 3 e 4 para uma linha: descobre params e busca veículos."""
    cod_emp, cod_area = emp["codEmp"], emp["codArea"]
    # Passo 3: descobrir codGar/codPGar (svlincodigo/tplinid já temos do view=0)
    url_lin = (f"{BASE}/sisGerReg_linhas.asp?tempoAtualiza=5"
               f"&codGar={cod_gar}&codArea={cod_area}&codEmp={cod_emp}"
               f"&busca=1&view=1&linCod={lin['svlincodigo']}")
    htm = await cli.get(url_lin)
    params = parse_carros_params(htm) if htm else None
    if not params:
        return {**lin, "codGar": cod_gar, "garagem": gar_nome,
                "codPGar": None, "qtd_veiculos": 0, "veiculos": [],
                "erro": "params .carros não encontrados"}

    # Passo 4: veículos
    url_car = (f"{BASE}/sisGerReg_carrosLinha.asp?"
               f"codGar={params['codGar']}&codPGar={params['codPGar']}"
               f"&svlincodigo={params['svlincodigo']}&tplinid={params['tplinid']}"
               f"&view=1")
    txt = await cli.get(url_car)
    veics = parse_veiculos(txt) if txt else []
    return {
        "linCod": lin["linCod"],
        "codGar": params["codGar"],
        "garagem": gar_nome,
        "codPGar": params["codPGar"],
        "svlincodigo": params["svlincodigo"],
        "tplinid": params["tplinid"],
        "qtd_veiculos": len(veics),
        "veiculos": veics,
    }


async def coleta_empresa(cli: Client, emp: dict):
    cod_emp, cod_area = emp["codEmp"], emp["codArea"]
    # Passo 1: HTML da empresa (view=0)
    url_emp = (f"{BASE}/sisGerReg.asp?codEmp={cod_emp}"
               f"&codArea={cod_area}&view=0&cus=")
    htm = await cli.get(url_emp)
    if not htm:
        return {"empresa": emp["label"], "codEmp": cod_emp,
                "codArea": cod_area, "erro": "sem resposta da empresa",
                "linhas": []}

    garagens = parse_garagens(htm, cod_emp)
    print(f"[{emp['label']}] garagens: {len(garagens)}")

    # Passo 2: para cada garagem, lista completa de linhas (view=0)
    tarefas = []
    for cod_gar, gar_nome in garagens.items():
        url_lst = (f"{BASE}/sisGerReg_linhas.asp?tempoAtualiza=5"
                   f"&codGar={cod_gar}&codArea={cod_area}&codEmp={cod_emp}"
                   f"&view=0&linCod=")
        htm_lst = await cli.get(url_lst)
        if not htm_lst:
            continue
        linhas = parse_lista_linhas(htm_lst)
        print(f"  garagem {cod_gar} ({gar_nome}): {len(linhas)} linhas")
        for lin in linhas:
            tarefas.append((cod_gar, gar_nome, lin))

    # Passos 3+4 em paralelo (concorrência limitada pelo semáforo)
    linhas_result = await asyncio.gather(
        *[coleta_linha(cli, emp, cg, gn, l) for cg, gn, l in tarefas]
    )
    return {
        "empresa": emp["label"],
        "codEmp": cod_emp,
        "codArea": cod_area,
        "qtd_linhas": len(linhas_result),
        "qtd_veiculos": sum(x["qtd_veiculos"] for x in linhas_result),
        "linhas": linhas_result,
    }


async def main():
    empresas = json.loads(EMPRESAS_PATH.read_text(encoding="utf-8"))
    cli = Client()
    try:
        resultados = []
        for emp in empresas:
            resultados.append(await coleta_empresa(cli, emp))
    finally:
        await cli.aclose()

    payload = {
        "gerado_em": datetime.now(timezone.utc).isoformat(),
        "fonte": "SIM/SPTrans - Pedra Eletrônica",
        "total_empresas": len(resultados),
        "total_linhas": sum(r.get("qtd_linhas", 0) for r in resultados),
        "total_veiculos": sum(r.get("qtd_veiculos", 0) for r in resultados),
        "empresas": resultados,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2),
                   encoding="utf-8")
    print(f"\nOK -> {OUT}  "
          f"({payload['total_empresas']} empresas, "
          f"{payload['total_linhas']} linhas, "
          f"{payload['total_veiculos']} veículos)")


if __name__ == "__main__":
    asyncio.run(main())
