/**
 * Gate de contraste sobre la fuente de los tokens (src/app.css), en ambos temas.
 * Un cambio de token que rompa WCAG 2.2 AA no puede mergearse.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, parseOklch, type Rgb } from './color';

const css = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');
const rootBlock = /:root\s*\{([\s\S]*?)\n\}/.exec(css)![1]!;
const declarations = new Map(
	[...rootBlock.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()])
);

function resolve(name: string, theme: 0 | 1, depth = 0): string {
	if (depth > 10) throw new Error(`Referencia circular en --${name}`);
	const value = declarations.get(name);
	if (value === undefined) throw new Error(`Token inexistente: --${name}`);
	const lightDark = /^light-dark\((.+)\)$/.exec(value);
	if (lightDark) {
		const parts = splitTopLevel(lightDark[1]!);
		return resolveValue(parts[theme]!, theme, depth);
	}
	return resolveValue(value, theme, depth);
}

function resolveValue(value: string, theme: 0 | 1, depth: number): string {
	const ref = /^var\(--([\w-]+)\)$/.exec(value.trim());
	return ref ? resolve(ref[1]!, theme, depth + 1) : value.trim();
}

function splitTopLevel(value: string): string[] {
	const parts: string[] = [];
	let level = 0;
	let start = 0;
	for (let i = 0; i < value.length; i++) {
		if (value[i] === '(') level++;
		else if (value[i] === ')') level--;
		else if (value[i] === ',' && level === 0) {
			parts.push(value.slice(start, i));
			start = i + 1;
		}
	}
	parts.push(value.slice(start));
	return parts;
}

const color = (name: string, theme: 0 | 1): Rgb => parseOklch(resolve(name, theme));

/** [primer plano, fondo, minimo, uso]. 4.5 = texto normal; 3 = componente de UI o foco. */
const PAIRS: readonly [string, string, number, string][] = [
	['text-primary', 'surface-page', 4.5, 'texto'],
	['text-primary', 'surface-raised', 4.5, 'texto en tarjeta'],
	['text-primary', 'surface-sunken', 4.5, 'texto en zona hundida'],
	['text-secondary', 'surface-page', 4.5, 'texto secundario'],
	['text-secondary', 'surface-raised', 4.5, 'texto secundario en tarjeta'],
	['text-secondary', 'surface-sunken', 4.5, 'texto secundario en zona hundida'],
	['text-link', 'surface-page', 4.5, 'enlace'],
	['action-primary-text', 'action-primary', 4.5, 'boton primario'],
	['action-primary-text', 'action-primary-hover', 4.5, 'boton primario (hover)'],
	['action-destructive-text', 'action-destructive', 4.5, 'boton destructivo'],
	['action-primary', 'surface-page', 3, 'borde/relleno de accion'],
	['border-control', 'surface-page', 3, 'borde de control'],
	['border-control', 'surface-raised', 3, 'borde de control en tarjeta'],
	['focus-ring', 'surface-page', 3, 'anillo de foco'],
	['focus-ring', 'surface-raised', 3, 'anillo de foco en tarjeta'],
	['feedback-danger', 'surface-page', 4.5, 'texto de error'],
	['feedback-warning', 'surface-page', 4.5, 'texto de advertencia'],
	['feedback-success', 'surface-page', 4.5, 'texto de exito'],
	['feedback-info', 'surface-page', 4.5, 'texto informativo'],
	['feedback-danger', 'surface-raised', 4.5, 'error en tarjeta'],
	['feedback-warning', 'surface-raised', 4.5, 'advertencia en tarjeta']
];

describe.each([
	['claro', 0],
	['oscuro', 1]
] as const)('contraste WCAG 2.2 AA, tema %s', (_, theme) => {
	it.each(PAIRS)('%s sobre %s ≥ %s:1 (%s)', (fg, bg, min) => {
		expect(contrastRatio(color(fg, theme), color(bg, theme))).toBeGreaterThanOrEqual(min);
	});
});

describe('conversion de color', () => {
	it('coincide con mediciones de referencia', () => {
		// Medido con scripts/contrast.py del kit de diseno sobre los tokens previos.
		expect(contrastRatio(parseOklch('oklch(0.22 0 0)'), parseOklch('oklch(0.985 0 0)'))).toBeCloseTo(16.5, 1);
		expect(parseOklch('oklch(0.42 0.13 255)')).toEqual([11, 76, 146]);
	});

	it('los semanticos de borde decorativo no se usan como borde de control', () => {
		// Recordatorio medible: --border-subtle no alcanza 3:1 y solo sirve para separadores.
		expect(contrastRatio(color('border-subtle', 0), color('surface-page', 0))).toBeLessThan(3);
	});
});
