import { describe, expect, it } from 'vitest';
import { discardOnLeave, isPristine } from './discard';
import { createProject } from './types';

const fresh = () => createProject();

describe('proyecto sin tocar', () => {
	it('uno recien creado esta sin tocar', () => {
		expect(isPristine(fresh())).toBe(true);
	});

	it('con nombre, datos del proceso o rondas ya no lo esta', () => {
		expect(isPristine(createProject('Arches'))).toBe(false);
		const withProcess = fresh();
		withProcess.process.paper = 'Arches Platine';
		expect(isPristine(withProcess)).toBe(false);
	});
});

describe('descartar al salir', () => {
	const id = 'abc';

	it('se descarta al navegar dentro de la app a otra ruta', () => {
		expect(discardOnLeave(fresh(), id, { type: 'link', toPath: '/' })).toBe(true);
		expect(discardOnLeave(fresh(), id, { type: 'goto', toPath: '/p/otro' })).toBe(true);
	});

	it('se conserva al cambiar de paso dentro del mismo proyecto', () => {
		expect(discardOnLeave(fresh(), id, { type: 'link', toPath: '/p/abc' })).toBe(false);
	});

	it('se conserva al recargar o cerrar la pestana', () => {
		expect(discardOnLeave(fresh(), id, { type: 'leave', toPath: null })).toBe(false);
	});

	it('nunca descarta un proyecto con datos', () => {
		expect(discardOnLeave(createProject('Arches'), id, { type: 'link', toPath: '/' })).toBe(false);
	});
});
