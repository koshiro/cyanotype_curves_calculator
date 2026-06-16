# Cyano Curve

Repositorio: [github.com/koshiro/cyanotype_curves_calculator](https://github.com/koshiro/cyanotype_curves_calculator)

Cyano Curve es una herramienta Python para calibrar negativos digitales de cianotipo. Genera targets de prueba, mide el resultado escaneado y exporta curvas para Photoshop (`.acv`) y GIMP (`.settings`).

El proyecto incluye una CLI completa y una GUI opcional basada en PySide6. La GUI no es necesaria para instalar ni usar el paquete desde linea de comandos.

## Instalacion

Desde PyPI, cuando el paquete este publicado:

```bash
python3 -m pip install cyano-curve
```

Desde el repositorio:

```bash
git clone git@github.com:koshiro/cyanotype_curves_calculator.git
cd cyanotype_curves_calculator
python3 -m venv .venv
.venv/bin/python -m pip install -e .
```

Para desarrollo y pruebas:

```bash
.venv/bin/python -m pip install -e ".[dev]"
.venv/bin/python -m pytest
```

Para instalar tambien la interfaz grafica:

```bash
.venv/bin/python -m pip install -e ".[gui]"
.venv/bin/cyano-curve-gui
```

Si ejecutas `cyano-curve-gui` sin haber instalado el extra `gui`, el comando falla de forma controlada e indica como instalar PySide6.

## Flujo recomendado

El flujo de calibracion tiene dos reglas importantes:

1. Conserva siempre el archivo `.layout.json` creado junto a cada target. Ese layout contiene las coordenadas y los valores enviados a la impresora.
2. No inviertas ni corrijas manualmente los targets de calibracion. Cyano Curve necesita saber exactamente que valores imprimiste para poder medirlos despues.

En cianotipo, el PNG generado se imprime como negativo digital. En el escaneo final, los rectangulos con mas tinta suelen verse mas claros en el papel, y las zonas mas expuestas mas azules u oscuras. El analisis interpreta esa respuesta negativa.

## 1. Generar Targets

Target simple:

```bash
cyano-curve generate \
  --method chartthrob_51 \
  --output target.png
```

Target compuesto en hoja carta, util para comparar varios metodos en una sola exposicion:

```bash
cyano-curve generate-composite \
  --methods pdn_21 pdn_31 chartthrob_51 gradient_256 \
  --output target_carta.png
```

Metodos disponibles:

- `pdn_21`: 21 parches, rapido y facil de leer.
- `pdn_31`: 31 parches, mas detalle sin ocupar demasiado.
- `chartthrob_51`: 51 parches, buena resolucion tonal.
- `gradient_256`: 256 pasos, mas exigente con impresion y escaneo.

Los comandos crean por defecto un layout con el mismo nombre base, por ejemplo `target_carta.layout.json`.

## 2. Imprimir, Exponer Y Escanear

1. Imprime el PNG generado en acetato o transparencia, sin ajustes automaticos del driver si puedes evitarlos.
2. Expone con el papel, quimica, negativo, impresora y tiempo que quieras calibrar.
3. Revela y deja secar de forma consistente.
4. Escanea sin auto-contraste, auto-color, sharpening, limpieza automatica ni perfiles variables.
5. Guarda el escaneo en un formato sin compresion destructiva cuando sea posible.

La calibracion solo vale para condiciones parecidas a las medidas. Si cambias papel, formula, impresora, acetato, curva de impresion o tiempo de exposicion, conviene validar de nuevo.

## 3. Analizar El Escaneo

```bash
cyano-curve analyze \
  --scan escaneo.png \
  --layout target_carta.layout.json \
  --output-dir curvas \
  --prefix carta \
  --report curvas/ranking.json
```

El analisis alinea el escaneo con las marcas de registro, mide los parches, calcula curvas y muestra un ranking de calidad de datos. El reporte JSON incluye advertencias, tonos unicos medidos, score de datos, metodo matematico recomendado y datos utiles para comparar rondas.

Metodos matematicos exportados por defecto:

- `pchip`
- `spline`
- `linear`
- `polynomial`

Formatos generados:

- `.acv`: Photoshop moderno, version 5, curva Master corregida y canales de color identidad.
- `_rgb.acv`: variante legacy, version 1, curva Master corregida y canales RGB identidad.
- `.settings`: GIMP moderno con 256 muestras.

Si varios parches caen en el mismo valor medido, Cyano Curve trata esa zona como tonos empastados. Para evitar una curva plana que recorte rango dinamico, descarta la cola no util y extrapola linealmente hasta el blanco.

## 4. Revisar Curvas

Puedes generar una previsualizacion sin abrir Photoshop o GIMP:

```bash
cyano-curve preview-curves \
  --curves curvas/carta_pdn_21_pchip.acv curvas/carta_chartthrob_51_spline.settings \
  --output preview_curvas.png
```

Esto crea un PNG con el grafico de las curvas seleccionadas.

## 5. Segunda Ronda De Calibracion

Para mejorar una primera curva, aplica esa curva a un nuevo target:

```bash
cyano-curve correct-target \
  --layout target_carta.layout.json \
  --curve curvas/carta_pdn_21_pchip.acv \
  --output carta_r2.png
```

El comando crea `carta_r2.layout.json`. Ese nuevo layout guarda los valores realmente enviados a la impresora despues de aplicar la curva previa, asi que debes usarlo al analizar el siguiente escaneo:

```bash
cyano-curve analyze \
  --scan escaneo_r2.png \
  --layout carta_r2.layout.json \
  --output-dir curvas_r2 \
  --prefix carta_r2 \
  --report curvas_r2/ranking.json
```

Para comparar rondas:

```bash
cyano-curve compare-reports \
  --before curvas/ranking.json \
  --after curvas_r2/ranking.json \
  --output comparacion_rondas.json
```

El resultado muestra cambios en tonos unicos, score, rango luminoso y parches empastados.

## 6. Comparar Target Base Y Corregido

Tambien puedes imprimir en una misma hoja un target base y otro corregido por la curva:

```bash
cyano-curve generate-comparison \
  --curve curvas/carta_pdn_21_pchip.acv \
  --output carta_comparativa.png
```

La hoja crea grupos como `pdn_31_base` y `pdn_31_corrected`, utiles para medir lado a lado que efecto tuvo la curva en una misma exposicion.

## 7. Validar Curvas Con Una Imagen

La validacion genera una hoja carta con miniaturas y una cuña de 21 pasos para cada curva:

```bash
cyano-curve validate-generate \
  --image foto.png \
  --curves curvas/carta_pdn_21_pchip.settings curvas/carta_chartthrob_51_pchip.settings \
  --output validacion.png
```

La hoja aplica la curva a la imagen positiva y luego invierte para imprimir como negativo. Para una foto normal, el flujo es:

```text
foto positiva -> aplicar curva -> invertir -> imprimir
```

Despues de imprimir, exponer, revelar y escanear la hoja:

```bash
cyano-curve validate-analyze \
  --scan escaneo_validacion.png \
  --layout validacion.layout.json \
  --output reporte_validacion.json
```

El reporte incluye tonos medidos de la cuña, RMSE frente a una respuesta ideal, rango tonal efectivo, regularidad entre pasos, violaciones de monotonia y estadisticas de luminosidad de la miniatura.

## GUI Opcional

La GUI se abre con:

```bash
cyano-curve-gui
```

Incluye pestanas para generar targets, analizar escaneos, crear segunda ronda, comparar reportes, generar hojas de validacion y previsualizar curvas. Requiere instalar el extra `gui`, que incluye PySide6:

```bash
python3 -m pip install "cyano-curve[gui]"
```

## Advertencias Practicas

- Usa siempre el mismo papel, quimica, impresora, acetato, orientacion, resolucion y ajustes de impresion durante una calibracion.
- Desactiva correcciones automaticas del escaner y del driver de impresion cuando sea posible.
- Conserva juntos `target.png`, `target.layout.json`, `escaneo.png`, curvas exportadas y `ranking.json`; son el historial minimo para auditar una calibracion.
- No compares curvas generadas bajo condiciones distintas como si fueran equivalentes.
- Si el ranking advierte pocos tonos unicos o muchos tonos empastados, revisa exposicion, densidad del negativo, escaneo y secado antes de confiar en la curva.

## Comandos Principales

```bash
cyano-curve generate
cyano-curve generate-composite
cyano-curve analyze
cyano-curve preview-curves
cyano-curve correct-target
cyano-curve generate-comparison
cyano-curve compare-reports
cyano-curve validate-generate
cyano-curve validate-analyze
cyano-curve-gui
```
