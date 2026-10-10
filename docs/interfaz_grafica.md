# Estudio para Agregar Interfaz Grafica

## Objetivo

Agregar una interfaz que permita usar `cyano-curve` sin recordar comandos largos, manteniendo el motor actual como fuente de verdad. La GUI deberia orquestar los mismos flujos que ya existen por CLI:

- generar targets,
- analizar escaneos,
- comparar rondas,
- generar targets corregidos,
- generar hojas de validacion con imagenes,
- previsualizar curvas.

## Recomendacion Principal: PySide6

La opcion mas adecuada es **PySide6 / Qt for Python**.

Razones:

- Es una GUI desktop real, adecuada para trabajar localmente con archivos grandes.
- Tiene buenos widgets para seleccionar archivos (`QFileDialog`), progreso (`QProgressDialog`) y vistas de imagen.
- Permite una interfaz de varias pestanas sin levantar un servidor web.
- Es empaquetable despues con herramientas como PyInstaller o Nuitka.
- Hay ejemplos oficiales de visor de imagen con zoom, guardado e impresion.

Arquitectura sugerida:

```text
src/cyano_curve/
  cli.py
  generator.py
  extractor.py
  calculator.py
  exporter.py
  validation.py
  reports.py
  gui/
    app.py
    main_window.py
    workers.py
    widgets.py
```

La GUI no deberia duplicar logica. Debe llamar a funciones existentes como:

- `write_composite_target`
- `write_corrected_target`
- `write_comparison_target`
- `extract_groups_from_scan`
- `compute_all_curves`
- `export_curve_set`
- `write_validation_sheet`
- `write_report_comparison`

## Flujo de Pantallas Propuesto

### 1. Target de Calibracion

Controles:

- seleccionar metodos: `pdn_21`, `pdn_31`, `chartthrob_51`, `gradient_256`,
- elegir salida PNG,
- generar target compuesto,
- vista previa de la hoja generada.

Accion interna:

```python
write_composite_target(...)
```

### 2. Analizar Escaneo

Controles:

- seleccionar escaneo,
- seleccionar layout,
- carpeta de salida,
- prefijo,
- checkbox para guardar imagen alineada,
- boton "Analizar".

Salida visible:

- ranking por target,
- tonos unicos antes/despues,
- warnings,
- curva recomendada,
- botones para abrir previews o carpeta de curvas.

Acciones internas:

```python
extract_groups_from_scan(...)
compute_all_curves(...)
export_curve_set(...)
rank_curve_computations(...)
```

### 3. Comparar Rondas

Controles:

- ranking anterior,
- ranking nuevo,
- salida JSON opcional.

Salida visible:

- tabla con:
  - tonos antes,
  - tonos despues,
  - delta de tonos,
  - delta de score,
  - delta de rango luminoso,
  - delta de empastados.

Accion interna:

```python
compare_ranking_reports(...)
```

### 4. Segunda Ronda

Controles:

- layout base,
- curva a aplicar,
- salida PNG,
- salida layout.

Salida visible:

- preview del target corregido,
- aviso: "Este target ya incorpora la curva. Imprimir tal cual."

Accion interna:

```python
write_corrected_target(...)
```

### 5. Validacion con Imagen

Controles:

- seleccionar foto,
- seleccionar varias curvas,
- cantidad de columnas,
- salida PNG.

Salida visible:

- hoja de validacion,
- etiquetas de curvas,
- recordatorio: "La hoja ya esta invertida como negativo."

Accion interna:

```python
write_validation_sheet(...)
```

## Manejo de Tareas Largas

La primera version usa cursor ocupado y acciones directas. Para escaneos muy grandes, el siguiente paso deberia ser mover operaciones lentas a workers:

- `QThread` o `QRunnable` para analisis con OpenCV,
- señales para progreso y errores,
- `QProgressDialog` para feedback.

Esto importa especialmente en:

- imagenes escaneadas grandes,
- alineacion con OpenCV,
- generacion de previews,
- exportacion masiva de curvas.

## Alternativas Evaluadas

### Streamlit

Ventajas:

- Muy rapido para prototipos.
- Facil crear formularios, subir imagenes y mostrar graficos.
- Ideal para dashboards de reportes.

Desventajas:

- Es una app web local, no una GUI desktop nativa.
- El manejo de archivos locales e impresiones puede sentirse menos natural.
- Requiere levantar un servidor.

Uso recomendado:

- prototipo rapido para visualizar rankings y comparar curvas.

### CustomTkinter

Ventajas:

- Simple, liviano y con aspecto moderno.
- Menos dependencias que PySide6.

Desventajas:

- Menos potente para visores de imagen grandes, zoom, layouts complejos y procesos largos.
- Para este proyecto puede quedarse corto si queremos previews, tablas y flujo completo.

Uso recomendado:

- version minima si se quiere una app muy simple.

## Decision Recomendada

Implementar primero una GUI con **PySide6**, manteniendo la CLI.

## Estado Implementado

La primera version ya existe como dependencia opcional:

```bash
.venv/bin/python -m pip install -e ".[gui]"
.venv/bin/cyano-curve-gui
```

Incluye pestanas para:

- generar target compuesto,
- generar hoja base vs corregida,
- analizar escaneos y exportar curvas,
- crear target corregido para segunda ronda,
- comparar reportes `ranking.json`,
- generar y analizar hoja de validacion con imagen,
- previsualizar curvas.

La GUI llama directamente al motor Python existente; no duplica el algoritmo de la CLI.

Plan incremental:

1. Agregar dependencia opcional:

```toml
[project.optional-dependencies]
gui = ["PySide6"]
```

2. Crear comando:

```bash
cyano-curve-gui
```

3. Implementar primera version con 3 pestanas:

- Generar target.
- Analizar escaneo.
- Validar con imagen.

4. Agregar luego:

- comparacion de rondas,
- preview de curvas,
- target corregido,
- guardado de presets de proyecto.

## Criterios de Exito

La GUI sera util si permite:

- seleccionar archivos sin escribir rutas,
- ver previews antes de imprimir,
- entender si una ronda mejoro o empeoro,
- evitar errores de inversion,
- abrir directamente la carpeta de salida,
- mantener compatibilidad total con la CLI.
