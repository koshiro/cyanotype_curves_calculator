import { describe, expect, it } from 'vitest';
import { en } from './en';
import { es } from './es';

describe('textos', () => {
	it('es y en tienen las mismas claves y los mismos parametros', () => {
		expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
		const params = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
		for (const key of Object.keys(es) as (keyof typeof es)[]) {
			expect(params(en[key]), key).toEqual(params(es[key]));
		}
	});

	it('sin rayas largas ni emoji en los textos', () => {
		for (const text of [...Object.values(es), ...Object.values(en)]) {
			expect(text).not.toMatch(/[—–]/);
			expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
		}
	});
});
