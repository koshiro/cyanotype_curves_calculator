# Estado del Arte: Calibración y Linearización de Negativos Digitales para Cianotipos

## Introducción

En los procesos fotográficos alternativos como el cianotipo, existe una relación no lineal entre los tonos de grises de una imagen digital (o mostrada en pantalla) y la densidad tonal real que se obtiene tras imprimir el negativo, exponerlo a luz UV y revelarlo en agua. 

Si imprimimos un gradiente lineal del 0% al 100% de negro sin aplicar correcciones, el resultado impreso generalmente presenta:
- Sombras empastadas (pérdida de detalle en las áreas oscuras).
- Luces lavadas o falta de contraste en las áreas claras.
- Transiciones tonales irregulares.

Para resolver esto, es indispensable un proceso de **linearización** o creación de una **curva de calibración**.

## Flujo de Trabajo Estandarizado

El proceso moderno de calibración de un negativo digital consta de los siguientes pasos fundamentales:

1. **Determinación del Tiempo de Exposición Estándar (Standard Exposure Time - SET):**
   Antes de generar cualquier curva, el usuario debe encontrar el tiempo mínimo de exposición necesario para obtener el azul más oscuro posible (DMax) utilizando un negativo transparente. Exponer por más tiempo de este punto no oscurece más el papel, pero puede arruinar las altas luces (DMin).
   
2. **Impresión de la Escala de Grises (Step Tablet / Step Chart):**
   Se genera digitalmente un "Step Wedge" o tabla de pasos con valores conocidos de luminosidad (ej. 21, 31, 51, o incluso 100 parches de gris desde el blanco puro al negro puro). Esta imagen se imprime sobre el sustrato transparente (acetato/OHP film) con las mismas configuraciones de impresora que se usarán para fotografías reales.

3. **Exposición y Revelado:**
   Se expone el papel sensibilizado para cianotipo usando el negativo de la escala de grises, empleando exactamente el tiempo de exposición determinado en el Paso 1. Luego se revela y se deja secar completamente, ya que el cianotipo se oxida y oscurece durante el secado (el uso de peróxido de hidrógeno acelera esta visualización).

4. **Escaneo y Medición:**
   El resultado impreso se escanea a una alta resolución y con todas las correcciones automáticas del escáner desactivadas. Alternativamente, se usa un espectrofotómetro o densitómetro. Digitalmente se extrae el valor de luminosidad de cada parche en la imagen escaneada.

5. **Cálculo de la Curva de Compensación (Inverse Curve):**
   Se comparan los valores impresos reales (medidos en el escaneo) con los valores ideales teóricos (la rampa lineal). 
   - Si el valor digital del parche era 50% gris, pero impreso salió al 70% de densidad (demasiado oscuro), la curva debe aplicar una corrección para aclarar ese valor antes de imprimir.
   - El cálculo implica crear una función de transferencia inversa.

6. **Aplicación e Impresión Final:**
   La curva generada se guarda como un perfil o ajuste preestablecido (ej. formato `.acv` de Photoshop o configuración de GIMP) y se aplica a cualquier imagen digital *antes* de invertirla e imprimirla. El resultado es un cianotipo con gradaciones tonales ricas y fieles a la imagen en pantalla.

## Referencias Clave en el Estado del Arte

- **Precision Digital Negatives (PDN):** Mark Nelson desarrolló uno de los sistemas más precisos utilizando una cuña de 31 pasos y análisis estadístico.
- **Dan Burkholder & Ron Reeder:** Pioneros en la estandarización del negativo digital desde finales de los 90s, proveyendo curvas de compensación de código abierto.
- La automatización computacional de este proceso ha ido reemplazando las antiguas tablas de Excel manuales, dando paso a scripts integrados y aplicaciones web que analizan las imágenes escaneadas mediante visión artificial básica para calcular las curvas automáticamente.