/**
 * Textos en espanol (idioma de referencia). `en.ts` debe tener exactamente las mismas claves:
 * el tipo `Messages` lo exige en compilacion.
 *
 * Vocabulario fijo: "negativo de calibracion" (lo que se imprime en acetato), "impresion"
 * (cada vez que se imprime y expone uno, antes llamada ronda), "copia" (el cianotipo resultante).
 * Sin rayas largas ni relleno: cada texto dice la cosa concreta.
 */
export const es = {
	'app.name': 'Cyano Curve',
	'app.tagline': 'Curvas para negativos digitales de cianotipo',
	'app.skip': 'Ir al contenido',
	'app.privacy': 'Todo ocurre en tu navegador. Tus escaneos no salen de tu equipo.',

	'settings.language.switch': 'English',
	'settings.language.label': 'Cambiar idioma a inglés',
	'settings.theme.label': 'Tema: {theme}. Cambiar tema',
	'settings.theme.system': 'según el sistema',
	'settings.theme.light': 'claro',
	'settings.theme.dark': 'oscuro',

	'projects.title': 'Proyectos',
	'projects.lead':
		'Cada proyecto es una combinación de papel, química, impresora y acetato. Calibra una vez por combinación.',
	'projects.new': 'Nuevo proyecto',
	'projects.empty.title': 'Aún no tienes proyectos',
	'projects.empty.body': 'Crea uno para generar tu primer negativo de calibración.',
	'projects.updated': 'Actualizado {date}',
	'projects.prints': '{count} impresiones',
	'projects.prints.one': '1 impresión',
	'projects.prints.none': 'Sin negativo aún',
	'projects.open': 'Abrir {name}',
	'projects.delete': 'Eliminar {name}',
	'projects.delete.title': '¿Eliminar «{name}»?',
	'projects.delete.body':
		'Se borran sus negativos, mediciones y curvas de este navegador. No se puede deshacer.',
	'projects.delete.confirm': 'Eliminar proyecto',
	'projects.untitled': 'Proyecto sin nombre',
	'projects.storage.unavailable':
		'Este navegador no permite guardar datos (modo privado o almacenamiento bloqueado). Los proyectos se perderán al cerrar la pestaña.',

	'common.cancel': 'Cancelar',
	'common.back': 'Proyectos',
	'common.saved': 'Guardado',

	'steps.label': 'Pasos de la calibración',
	'steps.project': 'Proceso',
	'steps.target': 'Negativo',
	'steps.scan': 'Escaneo',
	'steps.curve': 'Curva',
	'steps.export': 'Exportar',
	'steps.progress': 'Paso {current} de {total}',
	'steps.upcoming': 'Próximos pasos: {steps} (en construcción)',

	'project.title': 'Datos del proceso',
	'project.lead': 'Anota lo que define este proceso. Si cambias algo de esto, la curva deja de valer.',
	'project.name': 'Nombre del proyecto',
	'project.name.placeholder': 'Ej.: Arches Platine, fórmula clásica, Epson P900',
	'project.paper': 'Papel',
	'project.paper.placeholder': 'Ej.: Arches Platine 310 g',
	'project.chemistry': 'Química',
	'project.chemistry.placeholder': 'Ej.: clásica A+B 1:1',
	'project.printer': 'Impresora y tintas',
	'project.printer.placeholder': 'Ej.: Epson P900, tintas originales',
	'project.film': 'Acetato',
	'project.film.placeholder': 'Ej.: Pictorico OHP',
	'project.exposure': 'Exposición',
	'project.exposure.placeholder': 'Ej.: caja UV LED, 12 min',
	'project.notes': 'Notas',
	'project.notes.placeholder': 'Lo que quieras recordar de este proceso',
	'project.hint': 'Solo el nombre es necesario. El resto te ayuda a reconocer el proceso más adelante.',
	'project.next': 'Continuar al negativo',

	'target.title': 'Negativo de calibración',
	'target.lead': 'Imprímelo en acetato tal como se descarga y exponlo con tu proceso habitual.',
	'target.paper': 'Tamaño de hoja',
	'target.paper.letter': 'Carta',
	'target.paper.a4': 'A4',
	'target.paper.custom': 'Personalizado',
	'target.width': 'Ancho (mm)',
	'target.height': 'Alto (mm)',
	'target.steps': 'Pasos de tono',
	'target.steps.hint': 'Más pasos dan una curva más fina, pero exigen parches más pequeños.',
	'target.patch': 'Lado del parche (mm)',
	'target.patch.adjusted': 'Ajustado a {size} mm para que quepan {steps} pasos.',
	'target.dpi': 'Resolución de la imagen (DPI)',
	'target.summary': '{steps} pasos · {references} parches de referencia · {paper} · {width} × {height} px',
	'target.download': 'Descargar negativo (PNG)',
	'target.downloaded': 'Negativo de la impresión {print} descargado.',
	'target.downloaded.new':
		'Cambiaste las opciones después de escanear la impresión anterior: esta es la impresión {print}.',
	'target.downloaded.next':
		'Imprímelo, exponlo y deja secar la copia. Después escanéala en el paso siguiente.',
	'target.preview': 'Vista previa del negativo',
	'target.preview.unavailable': 'Sin vista previa: corrige las opciones.',
	'target.print.title': 'Para imprimir',
	'target.print.scale': 'Imprime al 100 %, sin ajustar a la página.',
	'target.print.color':
		'Desactiva la gestión de color del driver o usa el mismo perfil que usarás con tus fotos.',
	'target.print.same': 'Usa el mismo acetato, tintas y ajustes que para tus negativos reales.',
	'target.print.keep': 'El negativo queda guardado en el proyecto: lo necesitas para leer el escaneo.',
	'target.error.DOES_NOT_FIT':
		'No caben {required} parches en esta hoja (hay espacio para {capacity}). Reduce los pasos o el lado del parche.',
	'target.error.SHEET_TOO_SMALL':
		'La hoja es demasiado pequeña para las marcas de registro y los parches. Usa al menos {minWidth} × {minHeight} mm.',
	'target.error.INVALID_OPTIONS': 'Revisa los valores: hay un dato fuera de rango.',

	'scan.title': 'Escaneo de la copia',
	'scan.lead':
		'Escanea la copia ya seca, completa y sin recortar: las cuatro marcas de las esquinas deben verse.',
	'scan.print': 'Impresión',
	'scan.print.option': 'Impresión {print}',
	'scan.none.title': 'Primero imprime el negativo',
	'scan.none.body':
		'Descarga el negativo de calibración, imprímelo y expón una copia. Después vuelve con su escaneo.',
	'scan.none.action': 'Ir al negativo',
	'scan.drop.title': 'Arrastra el escaneo aquí',
	'scan.drop.or': 'o',
	'scan.drop.choose': 'Elige un archivo',
	'scan.drop.formats': 'TIFF o PNG de 16 bits por canal da las mediciones más finas. JPEG también sirve.',
	'scan.tips.title': 'Para escanear',
	'scan.tips.auto': 'Desactiva el autocontraste, la corrección de color y el enfoque del escáner.',
	'scan.tips.depth': 'Escanea a 48 bits (16 por canal) si tu escáner lo permite.',
	'scan.tips.resolution': 'Con 300 DPI basta.',
	'scan.tips.same': 'Usa siempre el mismo escáner y los mismos ajustes.',
	'scan.analyzing': 'Analizando {file}…',
	'scan.result': 'Escaneo de la copia con las marcas y parches detectados',
	'scan.summary': '{file} · {width} × {height} px · {bits} bits',
	'scan.summary.rotation': 'Girado {degrees}°',
	'scan.measured': '{count} parches medidos',
	'scan.outliers': '{count} con polvo o rayas (pesan menos)',
	'scan.flatfield.apply': 'Corregir la exposición despareja al medir',
	'scan.flatfield.hint':
		'Resta el efecto estimado del degradado en cada tono. Úsalo solo si no puedes repetir la exposición.',
	'scan.replace': 'Cambiar escaneo',
	'scan.next': 'Continuar a la curva',
	'scan.saved': 'Mediciones de la impresión {print} guardadas.',
	'scan.diag.MIRRORED':
		'La copia está espejada respecto del negativo. Es normal si expusiste el acetato con la tinta hacia el papel y no afecta la medición.',
	'scan.diag.EIGHT_BIT_SCAN':
		'Escaneo de {bits} bits: sirve, pero uno de 16 bits por canal da mediciones más finas.',
	'scan.diag.LOW_SCAN_RESOLUTION':
		'Los parches miden solo {patchPixels} px en el escaneo (mínimo {required}). Escanea a mayor resolución.',
	'scan.diag.UNEVEN_EXPOSURE':
		'La exposición no fue pareja: hasta {spanL} L* de diferencia en tonos medios entre zonas de la hoja. Revisa la fuente UV y el contacto del vidrio.',
	'scan.diag.LAYOUT_MISMATCH':
		'Los tonos medidos no siguen al negativo de esta impresión. ¿Es el escaneo de otra impresión o de otro proyecto?',
	'scan.error.title': 'No se pudo leer el escaneo',
	'scan.error.MARKERS_NOT_FOUND':
		'Faltan {count} de las 4 marcas de registro. Escanea la hoja completa, sin recortar, con las cuatro esquinas visibles.',
	'scan.error.GEOMETRY_INCONSISTENT':
		'Las marcas encontradas no forman la hoja esperada. ¿Corresponde el escaneo a esta impresión?',
	'scan.error.CORRUPT_FILE':
		'El archivo está dañado o incompleto. Vuelve a exportarlo desde el programa del escáner.',
	'scan.error.UNSUPPORTED_FORMAT': 'Formato no soportado. Usa TIFF, PNG o JPEG.',
	'scan.error.UNSUPPORTED_BIT_DEPTH':
		'Profundidad de color no soportada. Guárdalo como TIFF o PNG de 8 o 16 bits.',
	'scan.error.UNSUPPORTED_LAYOUT':
		'Esta variante del archivo no está soportada. Guárdalo como TIFF o PNG estándar de 8 o 16 bits.',
	'scan.error.UNKNOWN': 'Error inesperado al analizar el escaneo ({message}).',
	'chart.role': 'gráfico',
	'curve.title': 'Curva de corrección',
	'curve.lead':
		'Calculada con las mediciones de tus impresiones. Aplícala a la foto positiva y luego invierte para imprimir el negativo.',
	'curve.none.title': 'Aún no hay mediciones',
	'curve.none.body': 'Escanea al menos una impresión del negativo de calibración.',
	'curve.none.action': 'Ir al escaneo',
	'curve.prints': 'Impresiones incluidas',
	'curve.computing': 'Calculando la curva…',
	'curve.view': 'Vista',
	'curve.view.correction': 'Curva de corrección',
	'curve.view.response': 'Respuesta del papel',
	'curve.chart.correction': 'Curva de corrección: valor corregido para cada tono de la imagen',
	'curve.chart.response': 'Respuesta del papel: L* de la copia para cada valor del negativo',
	'curve.axis.input': 'Tono de la imagen (0 = negro)',
	'curve.axis.output': 'Valor corregido',
	'curve.axis.negative': 'Valor del negativo (0 = más tinta)',
	'curve.axis.lightness': 'L* de la copia',
	'curve.series.correction': 'Corrección',
	'curve.series.identity': 'Sin corrección',
	'curve.series.model': 'Modelo',
	'curve.series.measured': 'Medido',
	'curve.band': 'Rango útil del negativo',
	'curve.methods': 'Método de ajuste',
	'curve.method.smooth': 'Suave (P-spline)',
	'curve.method.pchip': 'PCHIP',
	'curve.method.linear': 'Lineal',
	'curve.method.smooth.hint': 'Sigue la tendencia y filtra el ruido de medición.',
	'curve.method.pchip.hint': 'Pasa por los puntos medidos sin oscilar.',
	'curve.method.linear.hint': 'Une los puntos medidos con rectas.',
	'curve.method.error': 'Error de validación {error} ΔL*',
	'curve.method.recommended': 'Recomendado',
	'curve.metrics': 'Resultado',
	'curve.metric.paper': 'Blanco del papel',
	'curve.metric.dmax': 'Negro máximo',
	'curve.metric.density': 'Rango de densidad',
	'curve.metric.usable': 'Negativo útil',
	'curve.metric.usable.value': '{percent} % (de {from} a {to})',
	'curve.metric.noise': 'Ruido de medición',
	'curve.table': 'Ver los datos en una tabla',
	'curve.table.input': 'Tono',
	'curve.table.output': 'Corregido',
	'curve.table.negative': 'Negativo',
	'curve.table.value': 'Valor del negativo',
	'curve.table.lightness': 'L* medido',
	'curve.table.replicates': 'Parches',
	'curve.next': 'Continuar a exportar',
	'curve.next.soon': 'El paso Exportar llega en la próxima versión.',
	'curve.error.title': 'No se pudo calcular la curva',
	'curve.error.TOO_FEW_VALUES': 'Se necesitan al menos {required} valores de tono medidos; hay {found}.',
	'curve.error.NOT_DECREASING':
		'La copia no se oscurece al aumentar la exposición. ¿Se invirtió el escaneo o es de otro negativo?',
	'curve.error.INVALID_MEASUREMENT': 'Hay una medición fuera de rango. Vuelve a escanear la impresión.',
	'curve.error.LOW_RANGE':
		'El rango tonal útil es de solo {range} L* (mínimo {required}). Aumenta la exposición o revisa la química.',
	'curve.error.UNKNOWN': 'Error inesperado al calcular la curva ({message}).',
	'curve.diag.WHITE_PLATEAU':
		'Los valores de negativo de {from} a {to} dan el mismo blanco: ahí la tinta bloquea de más. Puedes exponer un poco más.',
	'curve.diag.BLACK_PLATEAU':
		'De {from} a {to} el papel ya está en su negro máximo: la exposición es más larga de lo necesario.',
	'curve.diag.NON_MONOTONIC_MEASUREMENTS':
		'{count} mediciones retroceden más de lo que explica el ruido. Revisa polvo, rayas o parches confundidos.',
	'curve.diag.SPARSE_REGION':
		'Entre los valores {from} y {to} el tono salta {deltaL} L*. Una impresión con más pasos afinaría esa zona.',
	'curve.diag.HIGH_REPLICATE_SPREAD':
		'Los parches repetidos de valor {value} difieren {spread} L*: la exposición o el escaneo no fueron parejos.',
	'curve.diag.POOR_FIT': 'El ajuste tiene un error de {rmse} L*: las mediciones son ruidosas.',
	'curve.diag.PARTIAL_COVERAGE': 'Las mediciones solo cubren los valores {from} a {to} del negativo.',
	'curve.diag.LOW_RANGE': 'El rango tonal útil es de solo {range} L* (mínimo {required}).',
	'notfound.title': 'No encontramos ese proyecto',
	'notfound.body': 'Puede que se haya borrado o que esté en otro navegador.'
} as const;

export type MessageKey = keyof typeof es;
export type Messages = Record<MessageKey, string>;
