# Soluciones Open Source Existentes

Existen diferentes herramientas desarrolladas por la comunidad de procesos fotográficos alternativos para automatizar la linearización. Estudiarlas es clave para entender la lógica que el nuevo programa en Python debe replicar.

## 1. ChartThrob (por Kevin Bjorke)
**Repositorio / Origen:** Creado en 2006, mantenido en GitHub (`joker-b/ChartThrob`, y forks como `chainick/ChartThrobMod`).
**Plataforma:** Script de extensión `.jsx` (JavaScript ExtendScript) que se ejecuta internamente dentro de Adobe Photoshop.
**Flujo de funcionamiento:**
- **Creación:** Genera automáticamente un documento de calibración en escala de grises con parches estructurados dentro de Photoshop.
- **Análisis:** Tras imprimir, revelar y escanear, el usuario abre el escaneo en Photoshop. Al ejecutar el script nuevamente en modo análisis, ChartThrob lee el histograma/luminosidad de cada parche escaneado en ubicaciones espaciales predeterminadas.
- **Generación de Curva:** Calcula las discrepancias matemáticas y crea internamente una curva de ajuste que se guarda y aplica a las imágenes.
**Limitaciones:** Dependencia estricta a un software propietario costoso (Photoshop CS3 en adelante).

## 2. Easy Digital Negatives (EDN)
**Origen:** Desarrollado como un proyecto académico/comunitario, disponible en `easydigitalnegatives.com`.
**Plataforma:** Aplicación web basada completamente en navegador (HTML/JavaScript).
**Flujo de funcionamiento:**
- Permite subir el escaneo de una escala de prueba estandarizada o incluso subir las mediciones hechas con espectrofotómetro.
- Utiliza la API de Canvas de HTML5 para promediar los colores RGB en los parches correspondientes de la imagen y deducir sus valores de densidad/luminosidad.
- Contiene herramientas como *ColorBlocker* que calcula no solo curvas de contraste, sino qué tintas específicas de impresora (ej. la mezcla de amarillo y magenta que da rojo/verde) bloquean mejor la luz UV, haciendo negativos a color para mayor rango dinámico en cianotipo.
**Ventajas:** Multiplataforma, gratis, sin instalación de software pesado.
**Cómo resuelven el problema matemático:** Utilizan algoritmos de interpolación spline e inyectan el inverso en archivos LUT 1D o .acv descargables.

## 3. QuadToneRIP (QTR) & quadGEN
**Origen:** Herramientas orientadas a usuarios de impresoras Epson (repositorio moderno `David-Marsh-Photo/quadGEN`).
**Plataforma:** Herramientas web para componer `.quad` limits o archivos LUT.
**Flujo de funcionamiento:** 
- Son herramientas mucho más avanzadas orientadas a controlar directamente los inyectores y los canales individuales de tinta (Cyan, Magenta Claro, Negro Mate, etc.) de las impresoras.
- Aplican interpolaciones matemáticas (Spline cúbica o PCHIP) a archivos de mediciones LAB o CGATS.
- Ofrecen control paramétrico sobre contrastes.

## Síntesis de sus Métodos de Resolución
Todas estas herramientas comparten el siguiente modelo lógico que debemos implementar en Python:
1. **Detección Espacial:** Conocer de antemano el layout espacial de la imagen de prueba para extraer el bloque de píxeles central de cada parche, ignorando los bordes.
2. **Promediado (Averaging):** Sacar el tono promedio de grises de cada parche para limpiar el ruido del papel de acuarela escaneado.
3. **Mapeo Real vs Ideal:** Asignar los valores extraídos a una tabla `Y_medido_en_papel` vs `X_valor_digital_enviado_a_impresora`.
4. **Inversión y Normalización:** Generar la función inversa (ej. si quiero obtener un 50% de densidad, y en mi gráfico medido el 50% se logró cuando imprimí un 35% de píxel, la curva debe mapear `Entrada: 50 -> Salida: 35`).
5. **Interpolación:** Dado que solo medimos X parches (ej. 31), hay que interpolar suavemente los valores intermedios (de 0 a 255) sin generar oscilaciones artificiales. (Spline monótona o PCHIP es preferible a polinomial normal).