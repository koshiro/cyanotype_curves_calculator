# Formatos de Archivos de Curvas: Photoshop (.acv) y GIMP

Para aplicar las curvas de corrección calculadas, los fotógrafos aplican "presets" (ajustes preestablecidos) directamente en su software de edición fotográfica. A continuación, la estructura de los dos formatos más comunes.

## 1. Archivos `.acv` (Adobe Photoshop Curves)

El formato `.acv` es un archivo binario utilizado por Photoshop. Los datos están codificados en orden **Big-Endian**. El formato soporta ajustes para múltiples canales (Master, Rojo, Verde, Azul). Para negativos digitales en blanco y negro, comúnmente solo se define la curva principal (Master).

### Estructura Binaria (Versión 1 o 4)
- **Versión (2 bytes):** Número entero corto (`short int`), generalmente `1` o `4`.
- **Cantidad de curvas (2 bytes):** Número de curvas en el archivo (`short int`). Típicamente `1` (sólo curva Master) o `5` (Master, C, M, Y, K) o `4` (Master, R, G, B).

A continuación, por cada curva se repite esta estructura:
- **Cantidad de Puntos (2 bytes):** Número de puntos de anclaje de la curva (mínimo 2, máximo 19).
- **Lista de Puntos:**
  Por cada punto se leen 4 bytes (2 enteros cortos de 2 bytes cada uno):
  - **Output (Valor de Salida, Eje Y) [2 bytes]:** Valor entre 0 y 255.
  - **Input (Valor de Entrada, Eje X) [2 bytes]:** Valor entre 0 y 255.

*Nota:* Para leer y escribir este archivo en Python, se utiliza el módulo `struct` (ej. `struct.unpack('!h', data)` para interpretar los bytes grandes endian como enteros cortos).

---

## 2. Formato de Curvas de GIMP

GIMP no posee una única especificación técnica, ya que ha evolucionado. A diferencia de Photoshop, los archivos de GIMP son en formato de texto plano, facilitando su escritura desde scripts sin necesidad de manipulación binaria.

### Formato Antiguo (Compacto, típico hasta GIMP 2.8)
Se compone de comentarios y una matriz de coordenadas separadas por espacios. Las coordenadas van de 0 a 255. El valor `-1` representa puntos no utilizados.

```text
# GIMP Curves File
0 0 45 79 166 134 -1 -1 ... (hasta completar 17 puntos o los espacios necesarios) 255 255 
0 0 -1 -1 -1 -1 -1 -1 ... 255 255 
```
- La primera línea corresponde al canal de luminosidad.
- Las demás líneas corresponden a R, G, B y Alfa.

### Formato Moderno (GIMP > 2.10)
GIMP moderno utiliza un archivo de configuración de tipo Lisp-like (S-expressions). Frecuentemente tienen extensión `.settings`.

```text
# GIMP curves tool settings
(time 0)
(channel value)
(curve
    (curve-type smooth)
    (n-points 17)
    (points 34 0.000000 0.000000 -1.000000 -1.000000 ...)
    (n-samples 256)
    (samples 256 0.000000 0.012218 0.024425 ...)
)
```
- **points:** Es un arreglo 1D secuencial `(X1 Y1 X2 Y2 ...)`. Los valores están normalizados entre `0.0` y `1.0`. Si un punto no existe, se coloca `-1.000000`.
- **samples:** Son 256 valores flotantes ya interpolados representando directamente los valores de salida `Y` para cada `X` de `0` a `255`. Escribir los 256 `samples` es la forma más precisa de inyectar una curva precalculada, ya que evita depender del algoritmo interno de interpolación spline de GIMP.

### Recomendación para el Desarrollo
Para generar salidas compatibles, es mejor:
1. Para Photoshop: Exportar binarios `.acv` interpolando previamente una cantidad de anclajes (hasta 19) representativos de la función matemática.
2. Para GIMP: Generar un archivo de texto con sintaxis tipo Lisp, incluyendo la matriz de `256` valores pre-calculados (`samples`) en rango `0.0` a `1.0` para mayor fidelidad a la curva optimizada.