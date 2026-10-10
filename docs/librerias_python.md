# Arquitectura Recomendada y Librerías de Python

Para desarrollar un software independiente, robusto y automatizado de calibración de cianotipos, Python es el entorno ideal. A continuación, el detalle de las librerías necesarias para cumplir cada fase del proyecto.

## 1. Generación y Detección de Imágenes (Visión por Computadora)
**Librerías:** `OpenCV` (`cv2`), `Pillow` (PIL)

**Funcionalidad:**
- **Generación del patrón de calibración:** Utilizar `Pillow` o matrices de `numpy` para generar dinámicamente un archivo TIFF/PNG de alta resolución con, por ejemplo, 31 a 101 franjas rectangulares perfectas que abarquen valores desde `RGB(0,0,0)` hasta `RGB(255,255,255)`. Se pueden añadir marcas de registro (cuadrados en las esquinas) a la imagen.
- **Detección automática en el escaneo:** `OpenCV` es la herramienta estándar. Se puede usar:
  - Detección de contornos (`cv2.findContours`) y transformaciones de perspectiva (`cv2.warpPerspective`) para alinear automáticamente el escaneo en caso de que el usuario lo haya escaneado rotado, detectando las marcas de registro.
  - Alternativamente, basarse en la lógica del módulo de calibración de color de OpenCV (`cv2.ccm` o herramientas en `colour-science/colour-checker-detection`), que detectan patrones geométricos de grillas.

## 2. Procesamiento de Color y Matemáticas
**Librerías:** `numpy`, `colour-science`, `scipy`

**Funcionalidad:**
- **Extracción de Promedios:** Utilizando `numpy`, tras cortar el parche detectado espacialmente en la matriz de imagen de OpenCV, ignoramos los márgenes externos (ej. 10% del margen para evitar viñeteados) y se calcula la media (`np.mean`) o la mediana (`np.median`) del bloque, proveyendo alta inmunidad a las texturas o imperfecciones de aplicación del químico de cianotipo.
- **Espacios de Color:** La evaluación de luces no debe hacerse perceptualmente en sRGB no lineal. Utilizando `colour-science` (o funciones personalizadas de NumPy), se puede convertir sRGB a luminancia lineal flotante o LAB L* para equiparar la percepción visual de los parches.

## 3. Interpolación y Optimización de la Curva Inversa
**Librerías:** `scipy.interpolate`

**Funcionalidad:**
- Una vez obtenidos los pares `(Valor_Impreso_Deseado, Valor_Digital_Necesario_Para_Lograrlo)`, disponemos de un set de puntos discretos. Para formar una curva de 256 puntos (como en GIMP) o para escribir una curva continua:
- No se debe utilizar interpolación polinomial simple (ej. Lagrange de Numpy) porque tiende al "Fenómeno de Runge" (oscilaciones incontroladas en los extremos).
- Es preferible usar `scipy.interpolate.PchipInterpolator` (Piecewise Cubic Hermite Interpolating Polynomial) o interpolaciones Spline monótonas (`scipy.interpolate.UnivariateSpline` con *smoothing*). PCHIP garantiza que la curva siempre será creciente y monótona, condición vital para que la imagen final no presente saltos irreales de contraste y solarización no deseada.

## 4. Exportación de Formatos de Curvas
**Librerías:** `struct` (Standard Library de Python), Manejo de Strings/Archivos.

**Funcionalidad:**
- Para `.acv` (Photoshop): Utilizar la librería estándar `struct` (`struct.pack('>h', valor)`) para convertir los arrays interpolados por Scipy a la representación binaria *big-endian* requerida. Se empacará el identificador de versión, la cantidad de puntos seleccionados de la interpolación (ej. tomar los 15 puntos clave más relevantes con un algoritmo de simplificación de curva), y cada par coordenado `(Y, X)`.
- Para `.settings` (GIMP): Formatear un string multi-línea inyectando los 256 valores flotantes generados por la interpolación de SciPy sobre el rango `np.linspace(0, 1, 256)`, directamente bajo el campo `(samples 256 ...)`.

## Resumen de Flujo en Código
1. `generate_target(steps=51) -> target.png` (usando Pillow/numpy).
2. *El usuario imprime, hace el cianotipo y escanea.*
3. `align_and_extract_patches(scanned_image) -> array de promedios` (usando OpenCV).
4. `compute_inverse_curve(medidos, ideales) -> PchipInterpolator` (usando SciPy).
5. `export_acv(curva, "salida.acv")` y `export_gimp(curva, "salida.settings")` (usando `struct`).