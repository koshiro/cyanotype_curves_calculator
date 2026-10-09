/**
 * Geometria del target de calibracion (esquema v2).
 *
 * Cambios de fondo respecto a la version Python:
 * - Medidas fisicas (mm + DPI) en vez de pixeles fijos; hojas carta, A4 o personalizadas.
 * - Orden de parches aleatorio con semilla: el degradado de la luz UV hacia los bordes ya no
 *   se confunde con la respuesta tonal.
 * - Parches de referencia repetidos repartidos por la hoja: permiten medir y corregir la
 *   falta de uniformidad de la exposicion (campo plano) y el ruido de medicion.
 * - Cuatro marcas con identidad (ids 0..3 en TL, TR, BR, BL): un escaneo girado o espejado se
 *   detecta y corrige, en vez de medir parches equivocados en silencio.
 */
import { mulberry32, shuffle } from './random';

export const LAYOUT_SCHEMA = 'cyano-curve/target-layout';
export const LAYOUT_VERSION = 2;

export type PaperName = 'letter' | 'a4' | 'custom';

export const PAPER_SIZES_MM: Record<Exclude<PaperName, 'custom'>, readonly [number, number]> = {
	letter: [215.9, 279.4],
	a4: [210, 297]
};

export type Box = readonly [x0: number, y0: number, x1: number, y1: number];

export interface LayoutPatch {
	/** Posicion estable en el target (orden de lectura de la grilla). */
	id: number;
	/** Valor 0..255 a escribir en el negativo. */
	value: number;
	role: 'step' | 'reference';
	/** Caja en pixeles de la imagen generada. */
	box: Box;
}

export interface LayoutMarker {
	/** Id de la marca (0 = sup. izq., 1 = sup. der., 2 = inf. der., 3 = inf. izq.). */
	id: 0 | 1 | 2 | 3;
	center: readonly [number, number];
	/** Lado de la marca en pixeles (sin zona de silencio). */
	size: number;
}

export interface TargetLayout {
	schema: typeof LAYOUT_SCHEMA;
	version: typeof LAYOUT_VERSION;
	paper: { name: PaperName; widthMm: number; heightMm: number };
	dpi: number;
	width: number;
	height: number;
	seed: number;
	randomized: boolean;
	patchSizeMm: number;
	markers: LayoutMarker[];
	patches: LayoutPatch[];
}

export interface TargetOptions {
	paper?: PaperName;
	/** Requerido si `paper` es 'custom'. */
	customSizeMm?: readonly [number, number];
	dpi?: number;
	/** Cantidad de pasos equiespaciados 0..255 (se ignora si se pasan `values`). */
	steps?: number;
	/** Valores explicitos (p. ej. un target adaptativo de segunda ronda). */
	values?: readonly number[];
	/** Valores de referencia que se repiten por la hoja. */
	referenceValues?: readonly number[];
	/** Repeticiones de cada valor de referencia. */
	referenceReplicates?: number;
	patchSizeMm?: number;
	gapMm?: number;
	marginMm?: number;
	markerSizeMm?: number;
	randomize?: boolean;
	seed?: number;
}

export class LayoutError extends Error {
	constructor(
		readonly code: 'DOES_NOT_FIT' | 'INVALID_OPTIONS',
		readonly params: Record<string, number | string> = {}
	) {
		super(`${code} ${JSON.stringify(params)}`);
		this.name = 'LayoutError';
	}
}

/** Puntos repartidos (fraccion de la grilla) para las repeticiones de referencia. */
const SPREAD_POINTS: readonly (readonly [number, number])[] = [
	[0, 0],
	[1, 1],
	[1, 0],
	[0, 1],
	[0.5, 0.5],
	[0.5, 0],
	[0.5, 1],
	[0, 0.5],
	[1, 0.5]
];

export function stepValues(steps: number): number[] {
	if (!Number.isInteger(steps) || steps < 2 || steps > 256) {
		throw new LayoutError('INVALID_OPTIONS', { steps });
	}
	return Array.from({ length: steps }, (_, i) => Math.round((i * 255) / (steps - 1)));
}

export function buildTargetLayout(options: TargetOptions = {}): TargetLayout {
	const paperName = options.paper ?? 'letter';
	const [widthMm, heightMm] =
		paperName === 'custom' ? (options.customSizeMm ?? [0, 0]) : PAPER_SIZES_MM[paperName];
	if (!(widthMm > 50 && heightMm > 50)) throw new LayoutError('INVALID_OPTIONS', { widthMm, heightMm });

	const dpi = options.dpi ?? 300;
	const patchSizeMm = options.patchSizeMm ?? 12;
	const gapMm = options.gapMm ?? 2;
	const marginMm = options.marginMm ?? 10;
	const markerSizeMm = options.markerSizeMm ?? 14;
	const randomize = options.randomize ?? true;
	const seed = options.seed ?? 0x5eed;
	const referenceValues = options.referenceValues ?? [0, 128, 255];
	const replicates = options.referenceReplicates ?? 4;

	const invalid = (name: string, value: unknown) =>
		new LayoutError('INVALID_OPTIONS', { [name]: String(value) });
	if (!(Number.isFinite(dpi) && dpi >= 72 && dpi <= 2880)) throw invalid('dpi', dpi);
	for (const [name, value] of Object.entries({ patchSizeMm, markerSizeMm })) {
		if (!(Number.isFinite(value) && value > 0)) throw invalid(name, value);
	}
	for (const [name, value] of Object.entries({ gapMm, marginMm })) {
		if (!(Number.isFinite(value) && value >= 0)) throw invalid(name, value);
	}
	if (!(Number.isInteger(replicates) && replicates >= 0)) throw invalid('referenceReplicates', replicates);
	if (!Number.isInteger(seed)) throw invalid('seed', seed);
	for (const value of referenceValues) {
		if (!(Number.isFinite(value) && value >= 0 && value <= 255)) throw invalid('referenceValues', value);
	}

	const px = (mm: number) => Math.round((mm / 25.4) * dpi);
	const width = px(widthMm);
	const height = px(heightMm);
	const margin = px(marginMm);
	const markerSize = px(markerSizeMm);
	const patch = px(patchSizeMm);
	const gap = px(gapMm);

	// Las marcas ocupan las esquinas; la grilla de parches queda entre ellas con una
	// zona de silencio de media marca alrededor.
	const quiet = Math.round(markerSize / 2);
	const markerInset = margin + quiet + markerSize / 2;
	const markers: LayoutMarker[] = [
		{ id: 0, center: [markerInset, markerInset], size: markerSize },
		{ id: 1, center: [width - markerInset, markerInset], size: markerSize },
		{ id: 2, center: [width - markerInset, height - markerInset], size: markerSize },
		{ id: 3, center: [markerInset, height - markerInset], size: markerSize }
	];

	const gridLeft = margin;
	const gridTop = margin + 2 * quiet + markerSize + quiet;
	const gridWidth = width - 2 * margin;
	const gridHeight = height - 2 * gridTop;
	const columns = Math.floor((gridWidth + gap) / (patch + gap));
	const rows = Math.floor((gridHeight + gap) / (patch + gap));

	const steps = (options.values ?? stepValues(options.steps ?? 51)).map((v) => {
		if (!Number.isFinite(v) || v < 0 || v > 255) throw new LayoutError('INVALID_OPTIONS', { value: v });
		return Math.round(v);
	});
	const entries: { value: number; role: LayoutPatch['role'] }[] = [
		...steps.map((value) => ({ value, role: 'step' as const })),
		...referenceValues.flatMap((value) =>
			Array.from({ length: replicates }, () => ({ value: Math.round(value), role: 'reference' as const }))
		)
	];
	const capacity = columns * rows;
	if (entries.length > capacity) {
		throw new LayoutError('DOES_NOT_FIT', { required: entries.length, capacity });
	}

	const cellBox = (row: number, column: number, left: number, top: number): Box => {
		const x0 = left + column * (patch + gap);
		const y0 = top + row * (patch + gap);
		return [x0, y0, x0 + patch, y0 + patch];
	};

	let patches: LayoutPatch[];
	if (!randomize) {
		// Orden de lectura en una grilla compacta y centrada (util para inspeccion visual).
		const usedRows = Math.ceil(entries.length / columns);
		const usedWidth = columns * patch + (columns - 1) * gap;
		const usedHeight = usedRows * patch + (usedRows - 1) * gap;
		const left = gridLeft + Math.round((gridWidth - usedWidth) / 2);
		const top = gridTop + Math.round((gridHeight - usedHeight) / 2);
		patches = entries.map((entry, id) => ({
			id,
			value: entry.value,
			role: entry.role,
			box: cellBox(Math.floor(id / columns), id % columns, left, top)
		}));
	} else {
		// Toda la grilla disponible: las repeticiones de referencia van a puntos repartidos
		// (esquinas, centro, bordes) para medir el campo plano en toda la hoja, y el resto de
		// los parches ocupa celdas al azar, para no confundir posicion con tono.
		const usedWidth = columns * patch + (columns - 1) * gap;
		const usedHeight = rows * patch + (rows - 1) * gap;
		const left = gridLeft + Math.round((gridWidth - usedWidth) / 2);
		const top = gridTop + Math.round((gridHeight - usedHeight) / 2);
		const taken = new Map<number, (typeof entries)[number]>();
		const nearestFree = (row: number, column: number): number => {
			let best = -1;
			let bestDistance = Infinity;
			for (let cell = 0; cell < capacity; cell++) {
				if (taken.has(cell)) continue;
				const d = (Math.floor(cell / columns) - row) ** 2 + ((cell % columns) - column) ** 2;
				if (d < bestDistance) {
					bestDistance = d;
					best = cell;
				}
			}
			return best;
		};
		const references = entries.filter((e) => e.role === 'reference');
		const values = [...new Set(references.map((e) => e.value))];
		for (const [j, value] of values.entries()) {
			const copies = references.filter((e) => e.value === value);
			copies.forEach((entry, k) => {
				const [fx, fy] = SPREAD_POINTS[(k + j) % SPREAD_POINTS.length]!;
				taken.set(nearestFree(Math.round(fy * (rows - 1)), Math.round(fx * (columns - 1))), entry);
			});
		}
		const random = mulberry32(seed);
		const free = shuffle(
			Array.from({ length: capacity }, (_, cell) => cell).filter((cell) => !taken.has(cell)),
			random
		);
		entries.filter((e) => e.role === 'step').forEach((entry, i) => taken.set(free[i]!, entry));
		patches = [...taken.entries()]
			.sort(([a], [b]) => a - b)
			.map(([cell, entry]) => ({
				id: cell,
				value: entry.value,
				role: entry.role,
				box: cellBox(Math.floor(cell / columns), cell % columns, left, top)
			}));
	}

	return {
		schema: LAYOUT_SCHEMA,
		version: LAYOUT_VERSION,
		paper: { name: paperName, widthMm, heightMm },
		dpi,
		width,
		height,
		seed,
		randomized: randomize,
		patchSizeMm,
		markers,
		patches
	};
}

/** Centro de un parche en mm desde la esquina superior izquierda (para campo plano). */
export function patchCenterMm(layout: TargetLayout, patch: LayoutPatch): [number, number] {
	const [x0, y0, x1, y1] = patch.box;
	const toMm = (pxValue: number) => (pxValue / layout.dpi) * 25.4;
	return [toMm((x0 + x1) / 2), toMm((y0 + y1) / 2)];
}
