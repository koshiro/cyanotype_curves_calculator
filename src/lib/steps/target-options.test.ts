import { describe, expect, it } from 'vitest';
import {
	DEFAULT_TARGET,
	largestFittingPatch,
	minimumSheet,
	sameTarget,
	STEP_CHOICES,
	tryLayout
} from './target-options';

describe('opciones del target', () => {
	it('el target por defecto cabe en carta', () => {
		expect(tryLayout(DEFAULT_TARGET).layout).not.toBeNull();
	});

	it('cada cantidad de pasos tiene un parche que cabe en carta y en A4', () => {
		for (const paper of ['letter', 'a4'] as const) {
			for (const steps of STEP_CHOICES) {
				expect(largestFittingPatch({ ...DEFAULT_TARGET, paper, steps }), `${paper} ${steps}`).not.toBeNull();
			}
		}
	});

	it('sugiere un tamano minimo cuando la hoja es demasiado chica', () => {
		const options = {
			...DEFAULT_TARGET,
			paper: 'custom' as const,
			customSizeMm: [60, 60] as [number, number]
		};
		const [w, h] = minimumSheet(options)!;
		expect(w).toBeGreaterThan(60);
		expect(tryLayout({ ...options, customSizeMm: [w, h] }).layout).not.toBeNull();
	});

	it('detecta cambios de opciones', () => {
		expect(sameTarget(DEFAULT_TARGET, { ...DEFAULT_TARGET })).toBe(true);
		expect(sameTarget(DEFAULT_TARGET, { ...DEFAULT_TARGET, steps: 21 })).toBe(false);
	});
});
