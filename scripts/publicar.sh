#!/usr/bin/env bash
# Construye el sitio y lo publica en pibot (sitio estático, ver homelab-config/cluster/apps/cyano).
# nginx sirve el contenido nuevo al instante, sin reiniciar el pod.
set -euo pipefail

DESTINO="${CYANO_DESTINO:-daniel@k3s-node-0:/var/lib/homelab-cyano/}"

cd "$(dirname "$0")/.."

if [[ -n "$(git status --porcelain)" ]]; then
	echo "Hay cambios sin commitear; publica desde un árbol limpio." >&2
	exit 1
fi

npm ci
npm run build
rsync -a --delete build/ "$DESTINO"
echo "Publicado $(git rev-parse --short HEAD) en $DESTINO"
