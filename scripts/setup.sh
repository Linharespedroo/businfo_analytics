#!/usr/bin/env bash
# Setup local — instala deps, gera dados de amostra, sobe o dev server.
set -euo pipefail

if ! command -v node >/dev/null; then
  echo "✗ Node.js >=20 não encontrado. Instale antes de continuar." >&2
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "✗ Node $NODE_MAJOR detectado, mínimo é 20." >&2
  exit 1
fi

echo "▶ Instalando dependências…"
npm install

if [ ! -f .env ]; then
  cp .env.example .env
  echo "  .env criado a partir do exemplo (edite para usar dados reais)."
fi

echo "▶ Gerando dados de amostra…"
npm run data:sample

echo "▶ Pronto. Inicie com: npm run dev"
