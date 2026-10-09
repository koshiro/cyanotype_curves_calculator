/**
 * Inversion del modelo de respuesta: para cada tono positivo p se busca el valor de negativo
 * n(p) que produce la luminosidad objetivo, y se arma la curva de correccion C(p) = 255 − n(p).
 */
import { CalibrationError, type ResponseModel } from './types';

const GRID = 4096;

export interface CorrectionOptions {
	/**
	 * Tolerancia minima en ΔL* para considerar que una zona ya es blanco de papel o negro maximo.
	 * Define donde termina la meseta util en cada extremo (por defecto 0.5, casi imperceptible).
	 */
	plateauTolerance?: number;
	/**
	 * Ruido de medicion estimado (σ en L*). La meseta se recorta en max(plateauTolerance, 2σ):
	 * dentro de esa distancia del extremo, la pendiente medida no se distingue del ruido y
	 * invertirla producira saltos espurios en la curva.
	 */
	noise?: number;
	/** Rango minimo util en ΔL* para aceptar la calibracion (por defecto 15). */
	minRange?: number;
	/**
	 * Respuesta tonal objetivo: fraccion 0..1 del rango L* para el tono positivo p/255.
	 * Por defecto lineal en L* (perceptualmente uniforme).
	 */
	target?: (t: number) => number;
}

export interface CorrectionCurve {
	/** C(p) en 0..255 (flotante) para p = 0..255. Curva para "aplicar y luego invertir". */
	samples: Float64Array;
	/** n(p) = valor de negativo final (flotante) para p = 0..255. */
	negative: Float64Array;
	/** Evalua C para p continuo en 0..255 (util para imagenes de 16 bits). */
	evaluate: (p: number) => number;
	/** Valores de negativo donde empieza a responder el papel (blanco) y donde satura (negro). */
	usable: { whiteEdge: number; blackEdge: number };
	/** L* alcanzables: blanco del papel y negro maximo dentro del rango util. */
	lightness: { white: number; black: number; paper: number; dmax: number };
}

export function buildCorrection(model: ResponseModel, options: CorrectionOptions = {}): CorrectionCurve {
	const tolerance = Math.max(options.plateauTolerance ?? 0.5, 2 * (options.noise ?? 0));
	const minRange = options.minRange ?? 15;
	const target = options.target ?? ((t: number) => t);
	const [n0, n1] = model.domain;

	// Grilla densa del modelo, forzada a no crecer (el modelo ya es monotono; esto blinda
	// contra errores numericos minimos).
	const ns = new Float64Array(GRID);
	const ls = new Float64Array(GRID);
	for (let i = 0; i < GRID; i++) {
		const n = n0 + ((n1 - n0) * i) / (GRID - 1);
		ns[i] = n;
		ls[i] = i === 0 ? model.evaluate(n) : Math.min(model.evaluate(n), ls[i - 1]!);
	}
	const paper = ls[0]!;
	const dmax = ls[GRID - 1]!;

	const whiteEdge = firstAtOrBelow(ns, ls, paper - tolerance);
	const blackEdge = firstAtOrBelow(ns, ls, dmax + tolerance);
	const white = interpolateAt(ns, ls, whiteEdge);
	const black = interpolateAt(ns, ls, blackEdge);
	if (!(white - black >= minRange)) {
		throw new CalibrationError('LOW_RANGE', { range: round(white - black), required: minRange });
	}

	const negativeAt = (p: number): number => {
		const t = Math.min(Math.max(target(p / 255), 0), 1);
		const desired = black + (white - black) * t;
		return Math.min(Math.max(firstAtOrBelow(ns, ls, desired), whiteEdge), blackEdge);
	};

	const negative = new Float64Array(256);
	const samples = new Float64Array(256);
	for (let p = 0; p < 256; p++) {
		negative[p] = negativeAt(p);
		samples[p] = 255 - negative[p]!;
	}
	return {
		samples,
		negative,
		evaluate: (p) => 255 - negativeAt(Math.min(Math.max(p, 0), 255)),
		usable: { whiteEdge, blackEdge },
		lightness: { white, black, paper, dmax }
	};
}

/** Primer n (interpolado) donde la respuesta decreciente cae a `level` o menos. */
function firstAtOrBelow(ns: Float64Array, ls: Float64Array, level: number): number {
	if (ls[0]! <= level) return ns[0]!;
	let lo = 0;
	let hi = ls.length - 1;
	if (ls[hi]! > level) return ns[hi]!;
	// Invariante: ls[lo] > level >= ls[hi].
	while (hi - lo > 1) {
		const mid = (lo + hi) >> 1;
		if (ls[mid]! > level) lo = mid;
		else hi = mid;
	}
	const span = ls[lo]! - ls[hi]!;
	const t = span > 0 ? (ls[lo]! - level) / span : 1;
	return ns[lo]! + t * (ns[hi]! - ns[lo]!);
}

function interpolateAt(ns: Float64Array, ls: Float64Array, n: number): number {
	const step = (ns[ns.length - 1]! - ns[0]!) / (ns.length - 1);
	const u = Math.min(Math.max((n - ns[0]!) / step, 0), ns.length - 1);
	const i = Math.min(Math.floor(u), ns.length - 2);
	const t = u - i;
	return ls[i]! + t * (ls[i + 1]! - ls[i]!);
}

function round(value: number): number {
	return Math.round(value * 10) / 10;
}

/** CIE L* → densidad optica relativa (−log10 de la luminancia relativa Y). */
export function lightnessToDensity(lightness: number): number {
	const f = (lightness + 16) / 116;
	const y = lightness > 8 ? f * f * f : lightness / 903.3;
	return -Math.log10(Math.max(y, 1e-6));
}
