/**
 * Textos en espanol (idioma de referencia). `en.ts` debe tener exactamente las mismas claves:
 * el tipo `Messages` lo exige en compilacion.
 * Sin rayas largas ni relleno: cada texto dice la cosa concreta.
 */
export const es = {
	'app.name': 'Cyano Curve',
	'app.tagline': 'Curvas para negativos digitales de cianotipo',
	'app.skip': 'Ir al contenido',
	'app.privacy': 'Todo ocurre en tu navegador. Tus escaneos no salen de tu equipo.',

	'settings.language': 'Idioma',
	'settings.theme': 'Tema',
	'settings.theme.system': 'Sistema',
	'settings.theme.light': 'Claro',
	'settings.theme.dark': 'Oscuro',

	'projects.title': 'Proyectos',
	'projects.lead':
		'Cada proyecto es una combinación de papel, química, impresora y acetato. Calibra una vez por combinación.',
	'projects.new': 'Nuevo proyecto',
	'projects.empty.title': 'Aún no tienes proyectos',
	'projects.empty.body': 'Crea uno para generar tu primer target de calibración.',
	'projects.updated': 'Actualizado {date}',
	'projects.rounds': '{count} rondas',
	'projects.rounds.one': '1 ronda',
	'projects.open': 'Abrir {name}',
	'projects.delete': 'Eliminar',
	'projects.delete.title': 'Eliminar {name}',
	'projects.delete.body':
		'Se borran sus targets, mediciones y curvas de este navegador. No se puede deshacer.',
	'projects.delete.confirm': 'Eliminar proyecto',
	'projects.untitled': 'Proyecto sin nombre',
	'projects.storage.unavailable':
		'Este navegador no permite guardar datos (modo privado o almacenamiento bloqueado). Los proyectos se perderán al cerrar la pestaña.',

	'common.cancel': 'Cancelar',
	'common.back': 'Proyectos',
	'common.save': 'Guardar',
	'common.saved': 'Guardado',
	'common.optional': 'opcional',
	'common.soon': 'En construcción',

	'steps.label': 'Pasos de la calibración',
	'steps.project': 'Proyecto',
	'steps.target': 'Target',
	'steps.scan': 'Escaneo',
	'steps.curve': 'Curva',
	'steps.export': 'Exportar',
	'steps.progress': 'Paso {current} de {total}',

	'project.title': 'Datos del proceso',
	'project.lead': 'Anota lo que define este proceso. Si cambias algo de esto, la curva deja de valer.',
	'project.name': 'Nombre',
	'project.name.placeholder': 'Ej.: Arches Platine, fórmula clásica, Epson P900',
	'project.paper': 'Papel',
	'project.chemistry': 'Química',
	'project.chemistry.placeholder': 'Ej.: clásica A+B 1:1',
	'project.printer': 'Impresora y tintas',
	'project.film': 'Acetato',
	'project.exposure': 'Exposición',
	'project.exposure.placeholder': 'Ej.: caja UV LED, 12 min',
	'project.notes': 'Notas',
	'project.next': 'Continuar al target',

	'target.title': 'Target de calibración',
	'target.lead': 'Imprime este negativo en acetato tal como se descarga y exponlo con tu proceso habitual.',
	'target.paper': 'Tamaño de hoja',
	'target.paper.letter': 'Carta',
	'target.paper.a4': 'A4',
	'target.paper.custom': 'Personalizado',
	'target.width': 'Ancho (mm)',
	'target.height': 'Alto (mm)',
	'target.steps': 'Pasos de tono',
	'target.steps.hint': 'Más pasos dan una curva más fina, pero exigen parches más chicos.',
	'target.patch': 'Lado del parche (mm)',
	'target.dpi': 'Resolución de la imagen (DPI)',
	'target.summary': '{steps} pasos y {references} parches de referencia en {paper}',
	'target.download': 'Descargar negativo (PNG)',
	'target.preview': 'Vista previa del negativo',
	'target.print.title': 'Para imprimir',
	'target.print.scale': 'Imprime al 100 %, sin ajustar a la página.',
	'target.print.color':
		'Desactiva la gestión de color del driver o usa el mismo perfil que usarás con tus fotos.',
	'target.print.same': 'Usa el mismo acetato, tintas y ajustes que para tus negativos reales.',
	'target.print.keep': 'Este target queda guardado en el proyecto: lo necesitas para leer el escaneo.',
	'target.error.DOES_NOT_FIT':
		'No caben {required} parches en esta hoja (hay espacio para {capacity}). Reduce los pasos o el lado del parche.',
	'target.error.INVALID_OPTIONS': 'Revisa los valores: hay un dato fuera de rango.',

	'notfound.title': 'No encontramos ese proyecto',
	'notfound.body': 'Puede que se haya borrado o que esté en otro navegador.'
} as const;

export type MessageKey = keyof typeof es;
export type Messages = Record<MessageKey, string>;
