/**
 * Seleccion adaptativa de puntos de anclaje para formatos que guardan pocos puntos (.acv).
 *
 * Photoshop vuelve a interpolar los puntos con su propia spline. Se agregan puntos de forma
 * voraz donde la spline cubica natural (aproximacion del comportamiento de Photoshop) mas se
 * aleja de la curva real, o donde deja de ser monotona, hasta cumplir ambas condiciones o
 * llegar al maximo de puntos. El resultado declara cuanto se desvia: la interfaz debe
 * recomendar `.amp` cuando el `.acv` no alcanza la tolerancia.
 */
import { naturalCubic } from '../math/interpolate';

export type Anchor = readonly [input: number, output: number];

export interface AnchorOptions {
	/** Maximo de puntos (Photoshop acepta 2..19; 16 deja margen para editar a mano). */
	maxPoints?: number;
	/**
	 * Error maximo tolerado en niveles 0..255 (por defecto 1: un escalon de 8 bits). El .acv
	 * guarda enteros, asi que el redondeo ya aporta hasta 0.5 niveles.
	 */
	tolerance?: number;
}

export interface AnchorResult {
	anchors: Anchor[];
	/** Error maximo de la spline sobre los 256 niveles, en niveles 0..255. */
	maxError: number;
	/** Mayor caida de la spline reconstruida (0 si es monotona creciente). */
	maxDrop: number;
	/** true si la spline queda dentro de la tolerancia y sin caidas. */
	faithful: boolean;
}

/** Caida minima (en niveles) que se considera una inversion visible de la curva. */
const DROP_TOLERANCE = 0.25;

export function selectAnchors(samples: ArrayLike<number>, options: AnchorOptions = {}): AnchorResult {
	const maxPoints = Math.min(Math.max(options.maxPoints ?? 16, 2), 19);
	const tolerance = options.tolerance ?? 1;
	if (samples.length !== 256) throw new Error('selectAnchors: se esperan 256 muestras');
	const target = Array.from(samples, (v) => clampByte(v));
	const failing = (e: Evaluation) => e.maxError > tolerance || e.maxDrop > DROP_TOLERANCE;

	// Estrategia 1: voraz, agrega el punto donde la spline mas falla (o se invierte).
	const chosen = new Set<number>([0, 255]);
	let greedy = evaluate(chosen, target);
	while (failing(greedy) && chosen.size < maxPoints) {
		// Primero se corrige la peor caida (una curva que se invierte es peor que una imprecisa).
		let next = greedy.maxDrop > DROP_TOLERANCE ? greedy.dropAt : greedy.worst;
		if (chosen.has(next)) next -= 1;
		if (next < 0 || chosen.has(next)) break;
		chosen.add(next);
		greedy = evaluate(chosen, target);
	}
	if (!failing(greedy)) return result(greedy, target, false);

	// Estrategia 2: la spline es global y la voraz puede estancarse. Se prueban repartos por
	// longitud de arco (mas puntos donde la curva dobla o sube rapido) con cada cantidad de
	// puntos permitida, y se queda la mejor.
	let best = greedy;
	for (let count = 3; count <= maxPoints; count++) {
		const candidate = evaluate(new Set(arcLengthPoints(target, count)), target);
		if (score(candidate) < score(best)) best = candidate;
		if (!failing(best)) break;
	}
	return result(best, target, failing(best));
}

function score(e: Evaluation): number {
	// Una caida pesa mas que un error de la misma magnitud.
	return e.maxError + 4 * e.maxDrop;
}

function result(e: Evaluation, target: readonly number[], failed: boolean): AnchorResult {
	return {
		anchors: e.xs.map((x) => [x, Math.round(target[x]!)] as const),
		maxError: e.maxError,
		maxDrop: e.maxDrop,
		faithful: !failed
	};
}

/** `count` abscisas enteras repartidas uniformemente sobre la longitud de arco de la curva. */
function arcLengthPoints(target: readonly number[], count: number): number[] {
	const cumulative = [0];
	for (let x = 1; x < 256; x++) {
		cumulative.push(cumulative[x - 1]! + Math.hypot(1, target[x]! - target[x - 1]!));
	}
	const total = cumulative[255]!;
	const points = new Set<number>([0, 255]);
	for (let k = 1; k < count - 1; k++) {
		const goal = (total * k) / (count - 1);
		const x = cumulative.findIndex((c) => c >= goal);
		points.add(Math.min(Math.max(x, 1), 254));
	}
	return [...points].sort((a, b) => a - b);
}

interface Evaluation {
	xs: number[];
	maxError: number;
	worst: number;
	maxDrop: number;
	dropAt: number;
}

function evaluate(chosen: Set<number>, target: readonly number[]): Evaluation {
	const xs = [...chosen].sort((a, b) => a - b);
	const spline = naturalCubic(
		xs,
		xs.map((x) => Math.round(target[x]!))
	);
	let maxError = 0;
	let worst = 0;
	let maxDrop = 0;
	let dropAt = 0;
	let previous = clampByte(spline(0));
	for (let x = 0; x < 256; x++) {
		const value = clampByte(spline(x));
		const drop = previous - value;
		if (drop > maxDrop) {
			maxDrop = drop;
			dropAt = x;
		}
		previous = value;
		if (chosen.has(x)) continue;
		const error = Math.abs(value - target[x]!);
		if (error > maxError) {
			maxError = error;
			worst = x;
		}
	}
	return { xs, maxError, worst, maxDrop, dropAt };
}

function clampByte(value: number): number {
	return Math.min(Math.max(value, 0), 255);
}
