/**
 * Exportar e importar proyectos como JSON versionado: respaldo, cambio de navegador o
 * compartir un perfil de calibracion.
 */
import { PROJECT_SCHEMA, PROJECT_VERSION, newId, type Project } from './types';

export type ProjectImportErrorCode = 'INVALID_JSON' | 'NOT_A_PROJECT' | 'UNSUPPORTED_VERSION';

export class ProjectImportError extends Error {
	constructor(
		readonly code: ProjectImportErrorCode,
		readonly params: Record<string, number | string> = {}
	) {
		super(code);
		this.name = 'ProjectImportError';
	}
}

export function exportProject(project: Project): string {
	return JSON.stringify(project, null, 2);
}

/**
 * Lee un proyecto exportado. Si `existingIds` contiene su id, se le asigna uno nuevo para no
 * pisar el proyecto local.
 */
export function importProject(text: string, existingIds: ReadonlySet<string> = new Set()): Project {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		throw new ProjectImportError('INVALID_JSON');
	}
	if (!data || typeof data !== 'object' || (data as { schema?: unknown }).schema !== PROJECT_SCHEMA) {
		throw new ProjectImportError('NOT_A_PROJECT');
	}
	const project = data as Project;
	if (project.version !== PROJECT_VERSION) {
		throw new ProjectImportError('UNSUPPORTED_VERSION', { version: String(project.version) });
	}
	const valid =
		typeof project.id === 'string' &&
		typeof project.name === 'string' &&
		typeof project.process === 'object' &&
		project.process !== null &&
		Array.isArray(project.rounds) &&
		project.rounds.every((r) => r && typeof r === 'object' && r.layout && Array.isArray(r.layout.patches));
	if (!valid) throw new ProjectImportError('NOT_A_PROJECT');
	return existingIds.has(project.id) ? { ...project, id: newId() } : project;
}
