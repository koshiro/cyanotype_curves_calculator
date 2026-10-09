/**
 * Respuestas sinteticas de cianotipo para tests: sigmoide decreciente con mesetas en ambos
 * extremos (blanco de papel con mucha tinta, Dmax con acetato casi transparente).
 */
import { mulberry32 } from '../target/random';
import type { MeasuredPatch } from '../curve/types';

export interface SyntheticOptions {
	paper?: number;
	dmax?: number;
	/** Centro y ancho de la transicion en valores de negativo. */
	center?: number;
	width?: number;
	noise?: number;
	seed?: number;
}

export function syntheticResponse(options: SyntheticOptions = {}): (value: number) => number {
	const paper = options.paper ?? 92;
	const dmax = options.dmax ?? 28;
	const center = options.center ?? 140;
	const width = options.width ?? 38;
	return (value) => dmax + (paper - dmax) / (1 + Math.exp((value - center) / width));
}

export function syntheticPatches(values: readonly number[], options: SyntheticOptions = {}): MeasuredPatch[] {
	const response = syntheticResponse(options);
	const random = mulberry32(options.seed ?? 1);
	const noise = options.noise ?? 0;
	return values.map((value) => {
		// Box-Muller con el PRNG determinista.
		const u = Math.max(random(), 1e-12);
		const v = random();
		const gaussian = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
		return { value, lightness: response(value) + noise * gaussian };
	});
}

export function evenlySpaced(steps: number): number[] {
	return Array.from({ length: steps }, (_, i) => Math.round((i * 255) / (steps - 1)));
}
