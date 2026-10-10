# Cyano Curve: guía para agentes

App web estática (SvelteKit 2 + Svelte 5, TypeScript) para calibrar negativos digitales de cianotipo. Todo el
procesamiento ocurre en el navegador; no hay backend.

## Reglas

- `npm run verify` (lint + tipos + tests + build) debe pasar antes de cada commit.
- GitHub Flow: ramas `feat/`, `fix/`, `chore/`, `docs/` desde `main`; PR por fase; nada de push directo a `main`
  ni `--force`. Commits con Conventional Commits en español (`feat(curvas): …`).
- Comentarios y textos en español; identificadores en inglés.
- `src/lib/core/` es puro (sin DOM ni Svelte) y todo cambio ahí lleva tests.
- Convención del dominio (ver `src/lib/core/curve/types.ts`): `n` = valor del negativo (0 = máxima tinta),
  L\* decrece con `n`, curva exportada `C(p) = 255 − n(p)`.
- Diagnósticos y errores del núcleo usan códigos estables (`DiagnosticCode`, `LayoutError`); los textos visibles
  se traducen en la interfaz (es/en).
- Interfaz en grises neutros (croma 0) con tokens OKLCH en `src/app.css`; WCAG 2.2 AA.

## Interfaz (doctrina del plugin ux-ui-agent-skills, adaptada)

- Tokens en tres niveles dentro de `src/app.css`: primitivos (`--neutral-*`, `--prussian-*`…) nunca se usan
  en componentes; los componentes consumen solo semánticos (`--surface-*`, `--text-*`, `--action-*`,
  `--feedback-*`, `--space-*`, `--text-xs…5xl`, `--duration-*`). Nada de hex, px ni tiempos sueltos.
- Todo par de color nuevo se agrega a `src/lib/design/contrast.test.ts`; CI mide ambos temas.
- `--border-subtle` es decorativo; un control se delimita con `--border-control` (≥ 3:1).
- Token por intención: acciones destructivas usan `--action-destructive` en el disparador y en la confirmación.
- Base = teléfono; pantallas anchas con `min-width`. Sin desborde horizontal a 320 px.
- Cada elemento interactivo implementa sus estados: default, hover, focus, active, disabled y, si aplica,
  loading, error y selected.
- Prohibido: `<select>` nativo (usar listbox/combobox accesible), borde de color en un solo lado de tarjetas o
  avisos, emoji en cualquier lugar, rayas largas y relleno de marketing en los textos. El estado se comunica con
  icono (lucide, SVG inline con `currentColor`) más texto, nunca solo con color.
- Antes de dar por terminada una pantalla: lints del kit (`check_no_emoji`, `lint_hardcodes`,
  `lint_native_select`, `lint_taste` sobre `src/`), render en ambos temas a 320 px y escritorio, y revisión
  con el agente `design-critic`.
- Dependencias: versiones estables con al menos unas semanas de publicadas (SvelteKit 3 se evaluará más adelante).

## Despliegue

Sitio estático en pibot según `~/git/homelab-config/docs/DISENO-APPS.md` §4.2. Los manifiestos viven en ese repo
(`cluster/apps/cyano/`), no aquí. Plan y datos verificados de la fase 5: `docs/FASE-5-DESPLIEGUE.md`.

## Referencia

La implementación Python v0.1 está en el tag `v0.1-python`. Sirve solo como referencia; no se mantiene
compatibilidad con sus archivos.
