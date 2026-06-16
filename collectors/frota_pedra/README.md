# Coleta de Frota SIM/SPTrans (Pedra Eletrônica)

Automação que percorre a cadeia de requisições **públicas (sem autenticação)** do
sistema de monitoramento da SPTrans e consolida, por empresa → garagem → linha,
os veículos em operação com **prefixo, sigla, modelo por extenso e AVL**.

## Cadeia de requisições (4 níveis)

1. `sisGerReg.asp?codEmp&codArea&view=0`
   → HTML da empresa; descobre as **garagens** (`codGar`).
2. `sisGerReg_linhas.asp?codGar&codArea&codEmp&view=0`
   → **lista completa** das linhas da garagem (tabela única, **sem paginação**):
   código da linha (`svlincodigo`) + `tplinid` (sufixo após a `/`).
3. `sisGerReg_linhas.asp?...&busca=1&view=1&linCod=<COD>`
   → bloco `.carros` da linha, com `codGar`/`codPGar`/`svlincodigo`/`tplinid`.
4. `sisGerReg_carrosLinha.asp?codGar&codPGar&svlincodigo&tplinid&view=1`
   → **veículos** da linha.

> **Por que view=0 no nível 2:** no `view=1` o sistema mostra **uma linha por
> página** (com paginação via `linkPaginacao`), então varrer `view=1`
> diretamente pega só a 1ª linha. O `view=0` lista **todas** as linhas da
> garagem de uma vez; o `view=1&busca=1&linCod=` é usado depois, linha a linha,
> só para obter `codGar`/`codPGar`.

## Saída

`data/frota.json` (na raiz do repositório) — consolidado, **sobrescrito** a
cada execução:

```json
{
  "gerado_em": "2026-06-16T09:00:00+00:00",
  "total_empresas": 32,
  "total_linhas": 1500,
  "total_veiculos": 12000,
  "empresas": [
    {
      "empresa": "71/72 - Viação Campo Belo",
      "codEmp": 27, "codArea": 7,
      "linhas": [
        {
          "linCod": "106A",
          "codGar": "80", "codPGar": "7376",
          "svlincodigo": "106A", "tplinid": "10",
          "qtd_veiculos": 7,
          "veiculos": [
            {"prefixo":"22058","sigla":"B","modelo":"Básico","avl":"13237","acessivel":true,"ultima_transmissao":"..."}
          ]
        }
      ]
    }
  ]
}
```

## Execução local

```bash
pip install -r collectors/frota_pedra/requirements.txt
python collectors/frota_pedra/scraper.py
```

## Parâmetros (topo de `scraper.py`)

- `DELAY` — intervalo mínimo entre requisições (padrão `0.3`s)
- `CONCURRENCY` — requisições simultâneas (padrão `5`)
- `empresas.json` — mapa `codEmp`/`codArea` a varrer

## Volume

São ~32 empresas × N garagens × M linhas. Cada linha gera **2 requisições**
(nível 3 + nível 4), além de 1 por garagem (nível 2) e 1 por empresa (nível 1).
Com `DELAY=0.3s` e `CONCURRENCY=5`, a execução completa leva alguns minutos.

## Agendamento

`.github/workflows/coleta_frota.yml` roda **1×/dia às 03:00 BRT (06:00 UTC)**
e commita o JSON atualizado. Também pode ser disparado manualmente em
**Actions → Coleta Frota SPTrans → Run workflow**.

> Requer permissão de escrita do Actions: **Settings → Actions → General →
> Workflow permissions → Read and write permissions**.

## Validação

Os 3 parsers (`parse_lista_linhas`, `parse_carros_params`, `parse_veiculos`)
foram validados contra respostas reais das 4 etapas, incluindo linhas
compartilhadas (mesmo código com `tplinid` diferente → entradas distintas).
Na 1ª execução, confira os contadores no log (`garagens: N`,
`garagem X: N linhas`). Se vierem zerados para alguma empresa, capture a
resposta real e ajuste os regex correspondentes no topo do `scraper.py`.
