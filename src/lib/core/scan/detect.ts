/**
 * Deteccion de las cuatro marcas de registro en un escaneo y homografia layout → escaneo.
 *
 * Funciona sin conocer el DPI del escaneo, con cualquier giro (incluidos 90/180/270 grados),
 * con la copia espejada y con ambas polaridades: en la copia de cianotipo la tinta del negativo
 * queda como papel blanco y el acetato transparente como azul oscuro, al reves del negativo.
 *
 * Pasos: umbral local (imagen integral) en ambas polaridades → componentes conexos con forma de
 * marca → rectangulo de area minima sobre la envolvente convexa → lectura de los 6×6 modulos →
 * decodificacion con correccion de errores → homografia por minimos cuadrados con las 16
 * esquinas de las cuatro marcas.
 */
import {
	applyHomography,
	estimateHomography,
	reprojectionError,
	type Homography,
	type Point
} from '../image/homography';
import { sampleBilinear, toGray, type RasterImage } from '../image/types';
import type { TargetLayout } from '../target/layout';
import { decodeMarkerBits, MARKER_MODULES, SQUARE_TRANSFORMS, type MarkerId } from '../target/markers';

export type ScanErrorCode = 'MARKERS_NOT_FOUND' | 'GEOMETRY_INCONSISTENT';

export class ScanError extends Error {
	constructor(
		readonly code: ScanErrorCode,
		readonly params: Record<string, number | string> = {}
	) {
		super(`${code} ${JSON.stringify(params)}`);
		this.name = 'ScanError';
	}
}

export interface DetectedMarker {
	id: MarkerId;
	/** Esquinas canonicas TL, TR, BR, BL de la marca, en pixeles del escaneo. */
	corners: [Point, Point, Point, Point];
	center: Point;
	bitErrors: number;
	/** Contraste entre borde y zona de silencio (0..1). */
	contrast: number;
	/** 'normal' = tinta oscura (negativo); 'inverted' = tinta clara (copia de cianotipo). */
	polarity: 'normal' | 'inverted';
}

export interface TargetLocation {
	/** Lleva coordenadas del layout (px del target) a pixeles del escaneo. */
	homography: Homography;
	markers: DetectedMarker[];
	/** Error RMS de las 16 esquinas, en pixeles del escaneo. */
	reprojectionError: number;
	/** true si la copia esta espejada respecto del target (negativo impreso al reves). */
	mirrored: boolean;
	/** Giro aproximado del target dentro del escaneo, en grados (0..360). */
	rotationDegrees: number;
	/** Escala aproximada escaneo/target (p. ej. 2 = el escaneo tiene el doble de resolucion). */
	scale: number;
}

const DETECTION_MAX_SIDE = 1600;

export function detectMarkers(image: RasterImage): DetectedMarker[] {
	const gray = toGray(image);
	const factor = Math.max(1, Math.ceil(Math.max(image.width, image.height) / DETECTION_MAX_SIDE));
	const small = downsample(gray, image.width, image.height, factor);
	const minDim = Math.min(small.width, small.height);
	const radius = Math.max(3, Math.round(minDim * 0.04));
	const integral = integralImage(small.data, small.width, small.height);

	const found: DetectedMarker[] = [];
	for (const polarity of ['normal', 'inverted'] as const) {
		const mask = threshold(small.data, small.width, small.height, integral, radius, polarity);
		for (const hull of candidateHulls(mask, small.width, small.height, minDim)) {
			const rect = minAreaRectangle(hull).map(([x, y]) => [x * factor, y * factor] as Point);
			const marker = readMarker(gray, image.width, image.height, rect);
			if (marker) found.push(marker);
		}
	}

	// Una misma marca puede aparecer en varios candidatos: se queda la mejor lectura.
	const best = new Map<MarkerId, DetectedMarker>();
	for (const marker of found) {
		const current = best.get(marker.id);
		if (
			!current ||
			marker.bitErrors < current.bitErrors ||
			(marker.bitErrors === current.bitErrors && marker.contrast > current.contrast)
		) {
			best.set(marker.id, marker);
		}
	}
	return [...best.values()].sort((a, b) => a.id - b.id);
}

export function locateTarget(image: RasterImage, layout: TargetLayout): TargetLocation {
	const markers = detectMarkers(image);
	if (markers.length < 4) {
		throw new ScanError('MARKERS_NOT_FOUND', { found: markers.map((m) => m.id).join(',') });
	}
	const from: Point[] = [];
	const to: Point[] = [];
	for (const marker of markers) {
		const spec = layout.markers.find((m) => m.id === marker.id)!;
		const half = spec.size / 2;
		const [cx, cy] = spec.center;
		const layoutCorners: Point[] = [
			[cx - half, cy - half],
			[cx + half, cy - half],
			[cx + half, cy + half],
			[cx - half, cy + half]
		];
		layoutCorners.forEach((p, i) => {
			from.push(p);
			to.push(marker.corners[i]!);
		});
	}
	const homography = estimateHomography(from, to);
	const error = reprojectionError(homography, from, to);
	const markerSide = Math.hypot(
		markers[0]!.corners[1][0] - markers[0]!.corners[0][0],
		markers[0]!.corners[1][1] - markers[0]!.corners[0][1]
	);
	// Las esquinas deben calzar con el layout con un error pequeno frente al tamano de marca.
	if (!(error < markerSide * 0.08)) {
		throw new ScanError('GEOMETRY_INCONSISTENT', { error: Math.round(error * 10) / 10 });
	}

	const [ox, oy] = applyHomography(homography, [layout.width / 2, layout.height / 2]);
	const [ax, ay] = applyHomography(homography, [layout.width / 2 + 1, layout.height / 2]);
	const [bx, by] = applyHomography(homography, [layout.width / 2, layout.height / 2 + 1]);
	const cross = (ax - ox) * (by - oy) - (ay - oy) * (bx - ox);
	const rotation = (Math.atan2(ay - oy, ax - ox) * 180) / Math.PI;
	return {
		homography,
		markers,
		reprojectionError: error,
		mirrored: cross < 0,
		rotationDegrees: Math.round(((rotation + 360) % 360) * 10) / 10,
		scale: Math.hypot(ax - ox, ay - oy)
	};
}

// ---------------------------------------------------------------------------------------
// Imagen reducida, imagen integral y umbral local

function downsample(gray: Float32Array, width: number, height: number, factor: number) {
	if (factor === 1) return { data: gray, width, height };
	const w = Math.floor(width / factor);
	const h = Math.floor(height / factor);
	const data = new Float32Array(w * h);
	const area = factor * factor;
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			let sum = 0;
			for (let dy = 0; dy < factor; dy++) {
				const row = (y * factor + dy) * width + x * factor;
				for (let dx = 0; dx < factor; dx++) sum += gray[row + dx]!;
			}
			data[y * w + x] = sum / area;
		}
	}
	return { data, width: w, height: h };
}

function integralImage(data: Float32Array, width: number, height: number): Float64Array {
	const out = new Float64Array((width + 1) * (height + 1));
	for (let y = 0; y < height; y++) {
		let row = 0;
		for (let x = 0; x < width; x++) {
			row += data[y * width + x]!;
			out[(y + 1) * (width + 1) + x + 1] = out[y * (width + 1) + x + 1]! + row;
		}
	}
	return out;
}

function threshold(
	data: Float32Array,
	width: number,
	height: number,
	integral: Float64Array,
	radius: number,
	polarity: 'normal' | 'inverted'
): Uint8Array {
	const mask = new Uint8Array(width * height);
	const margin = 0.04;
	const stride = width + 1;
	for (let y = 0; y < height; y++) {
		const y0 = Math.max(0, y - radius);
		const y1 = Math.min(height, y + radius + 1);
		for (let x = 0; x < width; x++) {
			const x0 = Math.max(0, x - radius);
			const x1 = Math.min(width, x + radius + 1);
			const sum =
				integral[y1 * stride + x1]! -
				integral[y0 * stride + x1]! -
				integral[y1 * stride + x0]! +
				integral[y0 * stride + x0]!;
			const mean = sum / ((x1 - x0) * (y1 - y0));
			const v = data[y * width + x]!;
			mask[y * width + x] = (polarity === 'normal' ? v < mean - margin : v > mean + margin) ? 1 : 0;
		}
	}
	return mask;
}

// ---------------------------------------------------------------------------------------
// Componentes conexos y forma

function candidateHulls(mask: Uint8Array, width: number, height: number, minDim: number): Point[][] {
	const labels = new Int32Array(width * height);
	const parent: number[] = [0];
	const find = (a: number): number => {
		while (parent[a] !== a) {
			parent[a] = parent[parent[a]!]!;
			a = parent[a]!;
		}
		return a;
	};
	const union = (a: number, b: number) => {
		const ra = find(a);
		const rb = find(b);
		if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
	};

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = y * width + x;
			if (!mask[i]) continue;
			const neighbors: number[] = [];
			if (x > 0 && labels[i - 1]) neighbors.push(labels[i - 1]!);
			if (y > 0) {
				const up = i - width;
				if (labels[up]) neighbors.push(labels[up]!);
				if (x > 0 && labels[up - 1]) neighbors.push(labels[up - 1]!);
				if (x < width - 1 && labels[up + 1]) neighbors.push(labels[up + 1]!);
			}
			if (neighbors.length === 0) {
				parent.push(parent.length);
				labels[i] = parent.length - 1;
			} else {
				const first = neighbors[0]!;
				labels[i] = first;
				for (const n of neighbors) union(first, n);
			}
		}
	}

	interface Stats {
		area: number;
		minX: number;
		minY: number;
		maxX: number;
		maxY: number;
	}
	const stats = new Map<number, Stats>();
	for (let i = 0; i < labels.length; i++) {
		if (!labels[i]) continue;
		const root = find(labels[i]!);
		labels[i] = root;
		const x = i % width;
		const y = (i - x) / width;
		const s = stats.get(root);
		if (s) {
			s.area++;
			if (x < s.minX) s.minX = x;
			if (x > s.maxX) s.maxX = x;
			if (y < s.minY) s.minY = y;
			if (y > s.maxY) s.maxY = y;
		} else stats.set(root, { area: 1, minX: x, minY: y, maxX: x, maxY: y });
	}

	const minSide = Math.max(8, minDim * 0.015);
	const maxSide = minDim * 0.25;
	const accepted = new Set<number>();
	for (const [label, s] of stats) {
		const bw = s.maxX - s.minX + 1;
		const bh = s.maxY - s.minY + 1;
		const side = Math.max(bw, bh);
		const aspect = bw / bh;
		const fill = s.area / (bw * bh);
		if (side >= minSide && side <= maxSide && aspect > 0.6 && aspect < 1.67 && fill > 0.25 && fill < 0.97) {
			accepted.add(label);
		}
	}

	// Puntos de borde (esquinas de pixel) de cada componente aceptado.
	const boundary = new Map<number, Point[]>();
	for (let i = 0; i < labels.length; i++) {
		const label = labels[i]!;
		if (!label || !accepted.has(label)) continue;
		const x = i % width;
		const y = (i - x) / width;
		const edge =
			x === 0 ||
			y === 0 ||
			x === width - 1 ||
			y === height - 1 ||
			labels[i - 1] !== label ||
			labels[i + 1] !== label ||
			labels[i - width] !== label ||
			labels[i + width] !== label;
		if (!edge) continue;
		let list = boundary.get(label);
		if (!list) boundary.set(label, (list = []));
		list.push([x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]);
	}
	return [...boundary.values()].map(convexHull).filter((hull) => hull.length >= 4);
}

function convexHull(points: Point[]): Point[] {
	const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	const cross = (o: Point, a: Point, b: Point) =>
		(a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
	const lower: Point[] = [];
	for (const p of sorted) {
		while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, p) <= 0) lower.pop();
		lower.push(p);
	}
	const upper: Point[] = [];
	for (let i = sorted.length - 1; i >= 0; i--) {
		const p = sorted[i]!;
		while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, p) <= 0) upper.pop();
		upper.push(p);
	}
	return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Rectangulo de area minima que contiene la envolvente (calibres rotatorios). */
function minAreaRectangle(hull: readonly Point[]): Point[] {
	let best: { area: number; corners: Point[] } | null = null;
	for (let i = 0; i < hull.length; i++) {
		const a = hull[i]!;
		const b = hull[(i + 1) % hull.length]!;
		const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
		if (length === 0) continue;
		const ux = (b[0] - a[0]) / length;
		const uy = (b[1] - a[1]) / length;
		let minU = Infinity;
		let maxU = -Infinity;
		let minV = Infinity;
		let maxV = -Infinity;
		for (const [x, y] of hull) {
			const u = x * ux + y * uy;
			const v = -x * uy + y * ux;
			minU = Math.min(minU, u);
			maxU = Math.max(maxU, u);
			minV = Math.min(minV, v);
			maxV = Math.max(maxV, v);
		}
		const area = (maxU - minU) * (maxV - minV);
		if (!best || area < best.area) {
			const at = (u: number, v: number): Point => [u * ux - v * uy, u * uy + v * ux];
			best = { area, corners: [at(minU, minV), at(maxU, minV), at(maxU, maxV), at(minU, maxV)] };
		}
	}
	return best!.corners;
}

// ---------------------------------------------------------------------------------------
// Lectura de la grilla de modulos

const UNIT_SQUARE: Point[] = [
	[0, 0],
	[1, 0],
	[1, 1],
	[0, 1]
];

function readMarker(gray: Float32Array, width: number, height: number, rect: Point[]): DetectedMarker | null {
	const toImage = estimateHomography(UNIT_SQUARE, rect);
	const module = 1 / MARKER_MODULES;
	const sampleAt = (u: number, v: number): number => {
		let sum = 0;
		for (const du of [-0.2, 0, 0.2]) {
			for (const dv of [-0.2, 0, 0.2]) {
				const [x, y] = applyHomography(toImage, [u + du * module, v + dv * module]);
				sum += sampleBilinear(gray, width, height, x, y);
			}
		}
		return sum / 9;
	};

	const cells: number[][] = [];
	for (let r = 0; r < MARKER_MODULES; r++) {
		cells.push([]);
		for (let c = 0; c < MARKER_MODULES; c++) cells[r]!.push(sampleAt((c + 0.5) * module, (r + 0.5) * module));
	}
	const border: number[] = [];
	const inner: number[] = [];
	cells.forEach((row, r) =>
		row.forEach((value, c) => {
			const onBorder = r === 0 || c === 0 || r === MARKER_MODULES - 1 || c === MARKER_MODULES - 1;
			(onBorder ? border : inner).push(value);
		})
	);
	// Zona de silencio: anillo a medio modulo por fuera de la marca.
	const quiet: number[] = [];
	for (let k = 0; k < MARKER_MODULES; k++) {
		const t = (k + 0.5) * module;
		quiet.push(sampleAt(t, -0.5 * module), sampleAt(t, 1 + 0.5 * module));
		quiet.push(sampleAt(-0.5 * module, t), sampleAt(1 + 0.5 * module, t));
	}
	const borderMean = mean(border);
	const quietMean = mean(quiet);
	const contrast = Math.abs(borderMean - quietMean);
	if (contrast < 0.08) return null;
	const cut = (borderMean + quietMean) / 2;
	const isInk = (value: number) => (borderMean < quietMean ? value < cut : value > cut);
	// La tinta del borde y el papel de la zona de silencio deben leerse sin ambiguedad.
	if (border.filter(isInk).length < border.length * 0.9) return null;
	if (quiet.filter((v) => !isInk(v)).length < quiet.length * 0.85) return null;

	const bits = [1, 2, 3, 4].map((r) => [1, 2, 3, 4].map((c) => (isInk(cells[r]![c]!) ? 1 : 0)));
	const decoded = decodeMarkerBits(bits);
	if (!decoded) return null;

	const transform = SQUARE_TRANSFORMS[decoded.transform]!;
	const corner = (k: number): Point => {
		const [u, v] = UNIT_SQUARE[k]!;
		return applyHomography(toImage, transform(u, v));
	};
	const corners: [Point, Point, Point, Point] = [corner(0), corner(1), corner(2), corner(3)];
	const center = applyHomography(toImage, [0.5, 0.5]);
	return {
		id: decoded.id,
		corners,
		center,
		bitErrors: decoded.bitErrors,
		contrast,
		polarity: borderMean < quietMean ? 'normal' : 'inverted'
	};
}

function mean(values: readonly number[]): number {
	return values.reduce((s, v) => s + v, 0) / values.length;
}
