# Plan: tiempo de exposición y densidad UV del negativo (traspaso)

Documento autocontenido para que un agente ejecute las fases sin leer el historial. Redactado el 2026-10-10.
Antes de empezar, leer `CLAUDE.md` (reglas, convenciones del dominio y doctrina de interfaz).

## Objetivo

Hoy el usuario busca el tiempo destapando el papel por tiempos crecientes y elige el azul más sólido. Ese tiempo
(el "tiempo de impresión estándar", SPT) da el Dmax, pero no necesariamente la mayor cantidad de tonos: con
sobreexposición sube Dmin, las sombras se funden y el cianotipo puede solarizarse. Además, la app no sabe cuánta
densidad UV logra la combinación impresora + película.

Meta: **una sola hoja de prueba** que entregue

1. la curva característica del papel `f` (L\* en función de log H),
2. la densidad UV `D(n)` de cada valor de negativo `n` (impresora + película + tinta),
3. el tiempo recomendado (máximo de tonos separables con Dmax casi completo),
4. un diagnóstico si la película no bloquea lo suficiente para llegar al blanco del papel,
5. una curva inicial predicha que la calibración actual refina.

## Fundamento

- La densidad que importa es la UV, no la visible. La cámara del teléfono tiene filtro UV, así que no puede medir
  la película. Se usa el **propio papel como densitómetro UV**.
- Modelo por parche, con tiempo `t` y valor de negativo `n`:

  ```
  L*(t, n) = f(log10 t − D(n))       restricciones: D(255) = 0 (acetato), f monótona decreciente en log H
  ```

  `D(n)` crece al bajar `n` (0 = máxima tinta). La escala absoluta de H no se conoce ni hace falta.
- Es el problema de recuperación de respuesta de Debevec y Malik (SIGGRAPH 1997): mínimos cuadrados conjuntos
  sobre la curva y las exposiciones, con penalización de segunda derivada. Aquí las "exposiciones" conocidas son
  los tiempos y las incógnitas por parche son `D(n)` (12 valores), no un valor por píxel.
- Supuesto clave: **reciprocidad** (solo importa t·I). No hay datos publicados para cianotipo. La química
  (fotorreducción de Fe(III), sin imagen latente) sugiere que se cumple bien, pero la humedad del papel cambia en
  exposiciones largas. El diseño es redundante: cada `D(n)` se estima desde varias franjas y los residuos miden la
  falla. Si falla, cada franja sigue siendo una medición directa válida (solo se pierde interpolar en tiempo).
- Los tiempos no necesitan cubrir todo el rango del papel: los niveles de tinta lo extienden. El rango recuperado
  de log H es `[log t_min − D(0), log t_max]`, siempre que las franjas se solapen a través de los niveles de tinta.

## Diseño de la hoja de prueba

- **6 franjas de tiempo** en serie ×√2 centrada en el SPT que el usuario ya conoce: 0,35; 0,5; 0,71; 1; 1,41; 2 × SPT.
  Tiempo mínimo ≥ 1 min (errores al destapar). Se destapan de forma progresiva: la franja más larga primero; la
  app calcula los instantes de destapado acumulados y ofrece un temporizador.
- **12 niveles de negativo por franja**, más densos cerca del acetato, por ejemplo
  `n = 255, 245, 230, 210, 185, 155, 125, 95, 65, 40, 15, 0`.
- 2 repeticiones por franja, orden aleatorio con semilla dentro de la franja, más parches de referencia para campo
  plano (igual que el esquema v2 de `target/layout.ts`).
- Márgenes entre franjas por la penumbra del cartón; parches ≥ 12 mm; se mide el centro del parche.
- Unos 144 parches: caben en A4 o carta con las cuatro marcas actuales.
- Opcional: hueco para apoyar una cuña Stouffer (21 pasos × 0,15 D), cuyas densidades nominales validan `D(n)` y
  la reciprocidad de forma independiente.

## Recomendación de tiempo

Para un tiempo candidato T, predecir `L*(n) = f(log T − D(n))` para n = 0..255 y calcular:

- `Dmax(T) = f(log T)` (acetato) y la meseta `f(+∞)`; exigir Dmax ≥ 95 % de la meseta (umbral configurable).
- Blanco alcanzado: `f(log T − D(0))` dentro de JND del blanco del papel; si no, diagnóstico de densidad
  insuficiente.
- **Tonos separables** `N(T) = Σₖ min(1, ΔE00ₖ / JND)` sobre niveles consecutivos de n, con JND entre 1 y 2
  (configurable). Captura a la vez la amplitud y la posterización por cuantización de n.
- Recomendar `argmax N(T)` sujeto a las restricciones, con el intervalo de T dentro del 95 % del máximo.

## Diagnósticos nuevos (códigos estables, texto traducido en la interfaz)

Seguir el patrón de `DiagnosticCode` (definido en `src/lib/core/curve/types.ts`, usado en
`src/lib/core/curve/diagnostics.ts` y `src/lib/core/scan/analyze.ts`). Propuestos:

- `FILM_DENSITY_INSUFFICIENT`: con el tiempo recomendado la tinta máxima no deja el papel blanco. Sugerencias:
  bajar tiempo, subir densidad de color en el driver, probar tinta de color.
- `RECIPROCITY_RESIDUAL_HIGH`: las estimaciones de `D(n)` entre franjas no concuerdan.
- `DMAX_NOT_REACHED`: ninguna franja llega a la meseta (SPT de partida demasiado corto).
- `TIME_RANGE_TOO_NARROW`: el óptimo cae en el borde de las franjas probadas.

## Fases

Cada fase es una rama `feat/` desde `main` con su PR; `npm run verify` antes de cada commit.

### Fase E1: núcleo con datos simulados (empezar aquí)

- Módulo puro nuevo `src/lib/core/exposure/` con tests:
  - `model.ts`: tipos (`ExposureSample { timeSeconds, value, lightness, weight }`, resultado con `f`, `D`, residuos).
  - `solve.ts`: ajuste alterno: (a) con `D` fijo, ajustar `f` sobre `x = log t − D(n)` con `fitPSpline`
    decreciente (`src/lib/core/math/pspline.ts`); (b) con `f` fijo, actualizar cada `D(n)` por búsqueda 1D
    ponderada por la pendiente local al cuadrado; repetir hasta converger. Imponer `D(255) = 0` y `D` monótona
    con `isotonic` (`src/lib/core/math/isotonic.ts`). Inicializar `D` con una rampa lineal.
  - `recommend.ts`: tonos separables, restricciones y tiempo recomendado; ΔE00 no existe aún en el núcleo:
    agregarlo con tests (Sharma, Wu y Dalal, 2005, trae datos de prueba oficiales). Como el gris de la copia
    varía casi solo en L\*, ΔL\* es una aproximación aceptable si se quiere empezar más simple.
  - `diagnostics.ts`: códigos de arriba.
- Tests: generar datos con `f` y `D` conocidas (sigmoide de `testing/simulate.ts` y una `D(n)` saturante),
  ruido en L\*, y comprobar recuperación (`D` dentro de ±0,05, tiempo recomendado dentro de un paso de √2),
  detección de falla de reciprocidad (simular `t^p` con p ≠ 1) y de densidad insuficiente.
- Criterio de salida: convergencia robusta con ruido realista (σ ≈ 0,5–1 L\*). Si no converge, detenerse y
  reportar antes de seguir.

### Fase E2: validación en papel real (puerta de decisión)

- Script (fuera de la interfaz) que genera el PNG de 16 bits de la hoja 2D y la tabla de destapado.
- El usuario la imprime, la expone y la fotografía; el ajuste se hace con el núcleo de E1.
- Revisar: residuos de reciprocidad, coherencia de `D(n)`, y si el tiempo recomendado coincide con el juicio
  visual. Documentar resultados en este archivo. Seguir solo con el OK del usuario.

### Fase E3: objetivo y escaneo

- Nuevo tipo de objetivo en `src/lib/core/target/` (franjas, márgenes, orden aleatorio por franja, versión de
  esquema nueva), render en `render.ts`, y asignación de franja en `src/lib/core/scan/`.
- Extender `testing/simulate.ts` con un tiempo por franja para tests de extremo a extremo.

### Fase E4: interfaz

- Paso nuevo (patrón de `src/lib/steps/`): entrada del SPT de partida y fuente UV, descarga de la hoja,
  temporizador de destapado, medición, gráfico de tonos separables por tiempo y recomendación.
- Cumplir la doctrina de `CLAUDE.md`: tokens semánticos, ocho estados, sin `<select>` nativo, textos es/en,
  pares de contraste en `src/lib/design/contrast.test.ts`, render a 320 px y escritorio en ambos temas,
  revisión con `design-critic`.

### Fase E5: curva inicial y cuña física

- Curva inicial desde `f` y `D` alimentando la calibración existente (`src/lib/core/curve/calibrate.ts`).
- Soporte opcional de cuña Stouffer como validación.

## Avisos para el usuario (texto de interfaz)

- Usar una fuente UV estable (lámpara o medidor UV); con sol variable el tiempo no equivale a dosis.
- Esperar unas 24 h a que seque la tinta del negativo antes de exponer y medir la copia seca, idealmente a las
  24 h (el azul sigue oscureciendo al oxidarse).

## Bibliografía

- P. Debevec y J. Malik, "Recovering High Dynamic Range Radiance Maps from Photographs", SIGGRAPH 1997.
  <https://pauldebevec.com/Research/HDR/abstract.html>
- M. Ware, *Cyanotype: the history, science and art of photographic printing in Prussian blue* (1999) y
  *Cyanomicon* (2014). Autoenmascaramiento, humedad, sobreexposición. <https://www.mikeware.co.uk>
- M. I. Nelson, *Precision Digital Negatives*: SPT, Dmax/Dmin, negativos coloreados.
  <https://precisiondigitalnegatives.com>
- P. Davis, *Beyond the Zone System*: escala de exposición del papel frente al rango de densidad del negativo.
- C. Z. Anderson, *Cyanotype: The Blueprint in Contemporary Practice* (2019).
- F. Hurter y V. C. Driffield (1890), curva característica; ISO 6846 (rango del papel).
- Foros (anecdóticos): densidad UV de tintas <https://www.photrio.com/forum/threads/high-uv-blocking-inks.149495/>,
  densitómetros caseros <https://www.photrio.com/forum/threads/diy-densitometer.172228/>.

Las referencias a Davis, Anderson, Hurter y Driffield, e ISO 6846 se citaron de memoria: verificar ediciones antes
de citarlas formalmente.
