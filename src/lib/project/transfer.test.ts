import { describe, expect, it } from 'vitest';
import { buildTargetLayout } from '../core/target/layout';
import { exportProject, importProject, ProjectImportError } from './transfer';
import { createProject } from './types';

function sample() {
	const project = createProject('Arches');
	project.rounds.push({
		id: 'r1',
		createdAt: '2026-10-09T00:00:00Z',
		targetOptions: { steps: 21 },
		layout: buildTargetLayout({ steps: 21 })
	});
	return project;
}

function code(run: () => unknown): string {
	try {
		run();
	} catch (error) {
		return (error as ProjectImportError).code;
	}
	return 'SIN ERROR';
}

describe('exportar e importar proyectos', () => {
	it('ida y vuelta conserva el proyecto', () => {
		const project = sample();
		expect(importProject(exportProject(project))).toEqual(project);
	});

	it('si el id ya existe, asigna uno nuevo', () => {
		const project = sample();
		const imported = importProject(exportProject(project), new Set([project.id]));
		expect(imported.id).not.toBe(project.id);
		expect(imported.name).toBe('Arches');
	});

	it('rechaza archivos que no son proyectos con codigos estables', () => {
		expect(code(() => importProject('{no es json'))).toBe('INVALID_JSON');
		expect(code(() => importProject('{"schema":"otra-cosa"}'))).toBe('NOT_A_PROJECT');
		expect(code(() => importProject(JSON.stringify({ ...sample(), version: 9 })))).toBe(
			'UNSUPPORTED_VERSION'
		);
		expect(code(() => importProject(JSON.stringify({ ...sample(), rounds: 'x' })))).toBe('NOT_A_PROJECT');
	});
});
