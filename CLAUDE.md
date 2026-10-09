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
- Dependencias: versiones estables con al menos unas semanas de publicadas (SvelteKit 3 se evaluará más adelante).

## Despliegue

Sitio estático en pibot según `~/git/homelab-config/docs/DISENO-APPS.md` §4.2. Los manifiestos viven en ese repo
(`cluster/apps/cyano/`), no aquí.

## Referencia

La implementación Python v0.1 está en el tag `v0.1-python`. Sirve solo como referencia; no se mantiene
compatibilidad con sus archivos.
