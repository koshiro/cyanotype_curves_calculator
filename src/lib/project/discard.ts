import type { Project } from './types';

/** Navegacion que sale de la vista de un proyecto. `toPath` es null al recargar o cerrar la pestana. */
export interface LeaveNavigation {
	type: string;
	toPath: string | null;
}

/** Un proyecto recien creado y sin tocar: sin nombre, sin datos del proceso y sin rondas. */
export function isPristine(project: Project): boolean {
	return (
		!project.name.trim() &&
		project.rounds.length === 0 &&
		Object.values(project.process).every((v) => !v.trim())
	);
}

/**
 * Un proyecto sin tocar se descarta solo al navegar dentro de la app hacia otra ruta. Al recargar o cerrar
 * la pestana se conserva: recargar no debe hacer desaparecer el proyecto que se esta viendo.
 */
export function discardOnLeave(project: Project, id: string, nav: LeaveNavigation): boolean {
	if (nav.type === 'leave' || nav.toPath === null) return false;
	if (nav.toPath.startsWith(`/p/${id}`)) return false;
	return isPristine(project);
}
