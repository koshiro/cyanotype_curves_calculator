/**
 * Homografias planas 3×3 (h33 = 1) estimadas por DLT normalizado (Hartley) con minimos
 * cuadrados, a partir de 4 o mas correspondencias.
 */
export type Point = readonly [number, number];
export type Homography = readonly number[]; // 9 valores, fila mayor

export function applyHomography(h: Homography, [x, y]: Point): [number, number] {
	const w = h[6]! * x + h[7]! * y + h[8]!;
	return [(h[0]! * x + h[1]! * y + h[2]!) / w, (h[3]! * x + h[4]! * y + h[5]!) / w];
}

function normalization(points: readonly Point[]): { t: number[]; apply: (p: Point) => Point } {
	const n = points.length;
	const cx = points.reduce((s, p) => s + p[0], 0) / n;
	const cy = points.reduce((s, p) => s + p[1], 0) / n;
	const mean = points.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cy), 0) / n;
	const s = mean > 0 ? Math.SQRT2 / mean : 1;
	return {
		t: [s, 0, -s * cx, 0, s, -s * cy, 0, 0, 1],
		apply: ([x, y]) => [s * (x - cx), s * (y - cy)]
	};
}

function multiply(a: readonly number[], b: readonly number[]): number[] {
	const out = new Array<number>(9).fill(0);
	for (let r = 0; r < 3; r++)
		for (let c = 0; c < 3; c++)
			for (let k = 0; k < 3; k++) out[r * 3 + c] = out[r * 3 + c]! + a[r * 3 + k]! * b[k * 3 + c]!;
	return out;
}

export function invert3(m: readonly number[]): number[] {
	const [a, b, c, d, e, f, g, h, i] = m as [
		number,
		number,
		number,
		number,
		number,
		number,
		number,
		number,
		number
	];
	const A = e * i - f * h;
	const B = -(d * i - f * g);
	const C = d * h - e * g;
	const det = a * A + b * B + c * C;
	if (Math.abs(det) < 1e-15) throw new Error('Homografia singular');
	return [
		A / det,
		-(b * i - c * h) / det,
		(b * f - c * e) / det,
		B / det,
		(a * i - c * g) / det,
		-(a * f - c * d) / det,
		C / det,
		-(a * h - b * g) / det,
		(a * e - b * d) / det
	];
}

/** Resuelve A·x = b (n×n) por eliminacion gaussiana con pivoteo parcial. */
function solve(a: number[][], b: number[]): number[] {
	const n = b.length;
	for (let col = 0; col < n; col++) {
		let pivot = col;
		for (let r = col + 1; r < n; r++) if (Math.abs(a[r]![col]!) > Math.abs(a[pivot]![col]!)) pivot = r;
		if (Math.abs(a[pivot]![col]!) < 1e-12) throw new Error('Sistema singular al estimar la homografia');
		[a[col], a[pivot]] = [a[pivot]!, a[col]!];
		[b[col], b[pivot]] = [b[pivot]!, b[col]!];
		for (let r = col + 1; r < n; r++) {
			const f = a[r]![col]! / a[col]![col]!;
			for (let k = col; k < n; k++) a[r]![k] = a[r]![k]! - f * a[col]![k]!;
			b[r] = b[r]! - f * b[col]!;
		}
	}
	const x = new Array<number>(n).fill(0);
	for (let r = n - 1; r >= 0; r--) {
		let s = b[r]!;
		for (let k = r + 1; k < n; k++) s -= a[r]![k]! * x[k]!;
		x[r] = s / a[r]![r]!;
	}
	return x;
}

/** Homografia que lleva `from[i]` a `to[i]` (≥ 4 puntos, minimos cuadrados). */
export function estimateHomography(from: readonly Point[], to: readonly Point[]): Homography {
	if (from.length !== to.length || from.length < 4) {
		throw new Error('Se requieren al menos 4 correspondencias');
	}
	const nf = normalization(from);
	const nt = normalization(to);
	const ata = Array.from({ length: 8 }, () => new Array<number>(8).fill(0));
	const atb = new Array<number>(8).fill(0);
	const accumulate = (row: number[], value: number) => {
		for (let i = 0; i < 8; i++) {
			atb[i] = atb[i]! + row[i]! * value;
			for (let j = 0; j < 8; j++) ata[i]![j] = ata[i]![j]! + row[i]! * row[j]!;
		}
	};
	for (let i = 0; i < from.length; i++) {
		const [x, y] = nf.apply(from[i]!);
		const [u, v] = nt.apply(to[i]!);
		accumulate([x, y, 1, 0, 0, 0, -u * x, -u * y], u);
		accumulate([0, 0, 0, x, y, 1, -v * x, -v * y], v);
	}
	const h = [...solve(ata, atb), 1];
	// Deshace la normalizacion: H = T_to⁻¹ · Hn · T_from.
	const full = multiply(multiply(invert3(nt.t), h), nf.t);
	return full.map((v) => v / full[8]!);
}

/** Error RMS de reproyeccion en las unidades de `to`. */
export function reprojectionError(h: Homography, from: readonly Point[], to: readonly Point[]): number {
	let sum = 0;
	for (let i = 0; i < from.length; i++) {
		const [u, v] = applyHomography(h, from[i]!);
		sum += (u - to[i]![0]) ** 2 + (v - to[i]![1]) ** 2;
	}
	return Math.sqrt(sum / from.length);
}
