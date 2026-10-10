# Fase 5: despliegue en pibot (traspaso)

Documento autocontenido para que otro agente ejecute la fase 5 sin leer el historial. Estado al 2026-10-10: fases 1 a
4 mergeadas en `main` (PR #1 a #4); la app está completa y probada en local, incluido el uso sin conexión.

## Objetivo

Publicar Cyano Curve en `https://cyano.danielriquelme.cl` como **sitio estático en pibot** (patrón §4.2 de
`~/git/homelab-config/docs/DISENO-APPS.md`), servido por el túnel `pibot-webs` y con un Ingress solo como respaldo.

## Antes de empezar

1. Leer `~/git/homelab-config/AGENTS.md` y `~/git/homelab-config/docs/DISENO-APPS.md` §1, §4.2, §6, §7 y §8.
2. Trabajar en `~/git/homelab-config`, rama `feat/cyano` desde `main`. Ese repo tiene cambios ajenos sin commitear
   (qbittorrent, README): **no tocarlos ni incluirlos** en el commit.
3. Pedir confirmación al usuario antes de: crear la carpeta en pibot, `kubectl apply`, y cualquier llamada a la API de
   Cloudflare. El usuario lee en modo TDAH: primera línea = acción, pasos numerados, estado de la fase en cada turno.

## Datos ya verificados

| Dato                  | Valor                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------- |
| Plantilla a copiar    | `cluster/apps/noledigasanadie/` (misma zona `danielriquelme.cl`) o `cluster/apps/josekast/` (tiene ConfigMap de nginx) |
| Namespace / nombre    | `cyano`                                                                                |
| Carpeta en pibot      | `/var/lib/homelab-cyano` (`ssh daniel@k3s-node-0 sudo install -d -o daniel -g daniel /var/lib/homelab-cyano`) |
| NodePort              | **30892** (libre al 2026-10-10; ocupados 30890 josekast y 30891 noledigasanadie). Revalidar con `kubectl get svc -A` |
| Origen túnel          | `http://192.168.1.15:30892`                                                            |
| Imagen                | `nginx:1.27-alpine`, `nodeName: pibot`, tolerations de control-plane y master          |

## Archivos a crear o editar en homelab-config

1. `cluster/apps/cyano/`: `namespace.yml`, `configmap-nginx.yml`, `deployment.yml`, `service.yml` (NodePort 30892),
   `ingress.yml` (host `cyano.danielriquelme.cl`, entrypoint `web`, sin `tls`), `kustomization.yml`.
2. `cluster/kustomization.yml`: agregar `apps/cyano/`.
3. `cluster/00-infrastructure/backups/webs-estaticas-backup.yaml`: CronJob `config-backup-cyano` copiando el bloque
   de `noledigasanadie`. El contenido se regenera desde el repo, pero el patrón exige respaldo.
4. `proxmox/bin/check-backups.sh`: agregar `cyano` al bucle (línea ~23).
5. `README.md`: fila en **Servicios** y mención en «Sitios estáticos» y en la fila de exposición pública.

## nginx: requisitos propios de esta app

Es una SPA de SvelteKit con service worker. La configuración de josekast (`try_files … =404`) **no sirve** tal cual.

```nginx
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  charset utf-8;

  gzip on;
  gzip_comp_level 6;
  gzip_min_length 1024;
  gzip_types text/plain text/css application/javascript application/json application/manifest+json image/svg+xml;

  add_header X-Content-Type-Options nosniff always;
  add_header Referrer-Policy strict-origin-when-cross-origin always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
  add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'" always;

  # Archivos con hash: inmutables.
  location /_app/immutable/ {
    add_header Cache-Control "public, max-age=31536000, immutable" always;
    add_header X-Content-Type-Options nosniff always;
    try_files $uri =404;
  }

  # Deben revalidarse siempre para que las versiones nuevas lleguen.
  location = /service-worker.js { add_header Cache-Control "no-cache" always; try_files $uri =404; }
  location = /manifest.webmanifest {
    types { } default_type application/manifest+json;
    add_header Cache-Control "no-cache" always;
    try_files $uri =404;
  }

  # SPA: rutas como /p/<id> caen a index.html.
  location / {
    add_header Cache-Control "no-cache" always;
    try_files $uri $uri/ /index.html;
  }
}
```

Notas:

- `add_header` dentro de un `location` anula los del `server`: si se agregan cabeceras en un `location`, repetir las de
  seguridad (o moverlas a un `include`). Verificar con `curl -sI` cada tipo de ruta.
- `types { }` va solo dentro del `location` del manifiesto: a nivel `server` reemplazaría todos los tipos MIME.
- La CSP lleva `'unsafe-inline'` en `script-src` por el script de arranque inline de SvelteKit en `index.html`.
  Alternativa más estricta (opcional, en el repo cyano): `kit.csp` con `mode: 'hash'` en `svelte.config.js`.
- `data:` en `img-src`: vistas previas de escaneos y fotos. `blob:`: descargas. Los workers son archivos propios en
  `/_app/immutable/workers/`.

## Construir y publicar el contenido

Desde `~/git/cyano` en `main` actualizado:

```bash
npm ci && npm run build
rsync -a --delete build/ daniel@k3s-node-0:/var/lib/homelab-cyano/
```

Recomendado: agregar al repo cyano un `scripts/publicar.sh` con esos dos pasos (rama `chore/publicar`, PR aparte) y
mencionarlo en el comentario de cabecera del `deployment.yml`, como hace josekast.

## Cloudflare (lo hace el agente, §6 de DISENO-APPS)

No hay script en el repo: se usa la API directamente con el token `vault_cloudfare_full_api_token` del vault de
Ansible (`~/git/homelab-config/ansible/`, contraseña en `~/.config/homelab/ansible-vault-pass`). Nunca imprimir el
token en la salida.

1. Obtener `account_id`, el id del túnel `pibot-webs` (`GET /accounts/{account}/cfd_tunnel?name=pibot-webs`) y su
   configuración (`GET /accounts/{account}/cfd_tunnel/{tunnel}/configurations`).
2. `PUT` de la configuración con la regla `{"hostname":"cyano.danielriquelme.cl","service":"http://192.168.1.15:30892"}`
   insertada **antes** de la regla catch-all, conservando todas las demás.
3. DNS en la zona `danielriquelme.cl`: CNAME `cyano` → `<tunnel-id>.cfargotunnel.com`, proxied. Si ya existiera un
   registro por el comodín del túnel `pve`, el registro explícito tiene prioridad.
4. No proteger con Cloudflare Access: es una app pública sin datos de servidor.

## Verificación (criterios de cierre)

1. `kubectl kustomize cluster/apps/cyano` y `kubectl apply -k cluster/apps/cyano --dry-run=server` limpios.
2. `kubectl -n cyano rollout status deploy/cyano` y pod en `pibot`.
3. `curl -sI http://k3s-node-0:30892/` → 200; `curl -sI http://k3s-node-0:30892/p/x` → 200 (fallback SPA);
   `/_app/immutable/...` con `immutable`; `/service-worker.js` con `no-cache`; CSP presente en todas.
4. `curl -sI https://cyano.danielriquelme.cl` → 200 por `pibot-webs`.
5. En el navegador: crear proyecto, descargar negativo, sin errores de CSP en consola; Lighthouse/DevTools muestra la
   PWA instalable; recargar `/p/<id>` sin conexión funciona.
6. Lanzar una vez el CronJob de respaldo y comprobar el destino.
7. Commit `feat(cyano): sitio estatico en pibot` en homelab-config, PR, merge apenas funcione (con OK del usuario).

## Después de la fase 5 (no hacer ahora)

Validar con escaneos reales, perfiles ICC, opciones de impresora Epson y negativos coloreados, rondas adaptativas.
