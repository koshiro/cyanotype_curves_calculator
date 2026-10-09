# Cyano Curve

Calibrador de curvas para negativos digitales de cianotipo. Funciona **100 % en el navegador**: los escaneos y
las curvas nunca salen del equipo de quien lo usa.

> Estado: reescritura web en curso (v0.2). La implementación Python original queda como referencia en el tag
> [`v0.1-python`](https://github.com/koshiro/cyanotype_curves_calculator/tree/v0.1-python).

## Qué hace

1. Genera un target de calibración (carta, A4 o tamaño personalizado) con marcas de registro con identidad,
   parches en orden aleatorio y parches de referencia repetidos.
2. A partir de las mediciones del escaneo ajusta un **modelo monótono de la respuesta del papel** y lo invierte
   para obtener la curva que linealiza el proceso en L\*.
3. Exporta la curva para Photoshop (`.amp` exacto, `.acv` editable), GIMP (`.settings`) y cualquier editor con
   LUT (`.cube`).

## Cómo funciona el cálculo

Convención: `n` es el valor 0..255 del **negativo** (0 = máxima tinta) y L\* la luminosidad medida en la copia.
La respuesta L\*(n) es decreciente.

- **Agregación**: las repeticiones de un mismo valor se promedian y se mide su dispersión.
- **Modelos** (`src/lib/core/curve/response.ts`):
  - `smooth`: P-spline cúbica con penalización de rugosidad (λ elegido por GCV) y restricción de monotonía.
  - `pchip` y `linear`: interpolación sobre la proyección isotónica de los datos.
- **Selección**: validación cruzada leave-one-out en ΔL\*; se recomienda el de menor error.
- **Inversión** (`correction.ts`): para cada tono positivo `p` se busca `n(p)` tal que L\*(n) sea lineal entre el
  blanco y el negro alcanzables. Las mesetas de ambos extremos se recortan, en vez de desperdiciar rango del
  negativo. La curva exportada es `C(p) = 255 − n(p)` (flujo: positivo → curva → invertir → imprimir).
- **Diagnósticos** (`diagnostics.ts`): rango de densidad, fracción útil del negativo, mesetas, mediciones no
  monótonas (con umbral robusto al ruido), zonas con poca resolución, repeticiones dispares y error de ajuste.
  Cada diagnóstico tiene un código estable que la interfaz traduce.

Con datos sintéticos con ruido de escaneo, el modelo `smooth` linealiza con un error máximo de 0,3–0,9 ΔL\*,
frente a 1,2–2,5 ΔL\* de interpolar los datos crudos (que era el enfoque de la v0.1).

## Desarrollo

Requisitos: Node ≥ 24 y npm.

```bash
npm install
npm run dev       # servidor de desarrollo
npm test          # tests del núcleo (Vitest)
npm run verify    # lint + tipos + tests + build, igual que CI
npm run build     # sitio estático en build/
```

Estructura:

```
src/lib/core/      núcleo puro en TypeScript (sin DOM): matemática, curvas, exportadores, targets
src/routes/        interfaz (SvelteKit 2 + Svelte 5, SPA estática)
static/            archivos públicos
```

## Despliegue

Sitio estático servido por nginx en el cluster del homelab (patrón «sitio estático en pibot»). CI publica el
contenido de `build/` como artefacto; se sube con `rsync` al directorio que sirve nginx.

## Licencia

MIT.
