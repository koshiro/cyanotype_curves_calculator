# Cyano Curve

Calibrador de curvas para negativos digitales de cianotipo. Funciona **100 % en el navegador**: los escaneos y
las curvas nunca salen del equipo de quien lo usa.

En línea en **<https://cyano.danielriquelme.cl>**.

> Estado: v0.2, flujo completo y publicado; falta validarlo con escaneos reales. La implementación Python original
> queda como referencia en el tag
> [`v0.1-python`](https://github.com/koshiro/cyanotype_curves_calculator/tree/v0.1-python).

## Qué hace

El flujo tiene seis pasos, cada uno guardado en un proyecto del navegador (IndexedDB):

1. **Proceso**: papel, química, impresora, acetato y exposición. Si algo cambia, la curva deja de valer.
2. **Negativo de calibración**: hoja carta, A4 o personalizada, 21 a 256 pasos de tono, parches en orden aleatorio,
   referencias repetidas para medir el campo plano y marcas de registro con identidad. Se descarga en PNG con el DPI
   incrustado.
3. **Escaneo**: se sube el escaneo de la copia (TIFF o PNG de 16 bits, o JPEG). Un Web Worker detecta las marcas con
   cualquier giro o espejo, mide cada parche (mediana de L\* y densidad roja) y avisa de problemas (exposición
   despareja, resolución baja, escaneo de 8 bits, layout equivocado).
4. **Curva**: ajuste de la respuesta del papel con tres métodos, validación cruzada para recomendar uno, gráfico
   interactivo accesible con teclado, métricas físicas y diagnósticos con causa y acción. Las impresiones de varias
   rondas se combinan.
5. **Exportar**: Photoshop (`.amp` exacto o `.acv` editable), GIMP (`.settings`), LUT `.cube` (también con la
   inversión incluida) y el proyecto completo en JSON para respaldarlo o moverlo a otro navegador.
6. **Foto**: aplica la curva a una foto (TIFF, PNG o JPEG), la invierte y la espeja, y entrega el negativo en TIFF o
   PNG de 16 bits en escala de grises con el DPI elegido.

Se instala como app (PWA) y funciona sin conexión: un service worker guarda la aplicación al primer uso.

La interfaz está en español e inglés, con tema claro y oscuro, y cumple WCAG 2.2 AA: el contraste de cada pareja de
colores se mide en CI.

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
src/lib/core/      núcleo puro en TypeScript (sin DOM): matemática, curvas, exportadores, targets, escaneo
src/lib/io/        lectura de PNG/TIFF de 8 y 16 bits y escritura del PNG del negativo
src/lib/scan/      análisis de escaneos (Web Worker)
src/lib/curve/     cálculo de curvas para la interfaz (Web Worker)
src/lib/photo/     negativo de una foto en 16 bits (Web Worker)
src/lib/project/   proyectos en IndexedDB, importación y exportación JSON
src/lib/design/    color OKLCH y test de contraste WCAG de los tokens
src/lib/steps/     pantallas de cada paso
src/lib/ui/        componentes, tema, gráfico
src/lib/i18n/      textos es/en
src/routes/        rutas (SPA estática)
scripts/           publicar.sh (despliegue)
docs/              notas de despliegue
```

## Despliegue

Sitio estático servido por nginx en pibot (cluster del homelab), expuesto por un túnel de Cloudflare. Los manifiestos
viven en el repo del homelab (`cluster/apps/cyano/`); la configuración de nginx (fallback SPA, caché del service
worker, CSP) está documentada en [`docs/FASE-5-DESPLIEGUE.md`](docs/FASE-5-DESPLIEGUE.md).

Para publicar una versión nueva desde `main` limpio:

```bash
scripts/publicar.sh   # npm ci + build + rsync a pibot; nginx la sirve sin reiniciar
```

El destino se cambia con `CYANO_DESTINO`. CI también deja `build/` como artefacto descargable (14 días).

## Licencia

MIT.
