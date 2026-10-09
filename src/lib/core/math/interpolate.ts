/**
 * Interpoladores 1D sobre abscisas estrictamente crecientes.
 */

export type Interpolant = (x: number) => number;

function assertStrictlyIncreasing(xs: readonly number[]): void {
	if (xs.length < 2) throw new Error('Se requieren al menos dos puntos para interpolar');
	for (let i = 1; i < xs.length; i++) {
		if (!(xs[i]! > xs[i - 1]!)) throw new Error('Las abscisas deben ser estrictamente crecientes');
	}
}

/** Indice del intervalo [xs[i], xs[i+1]] que contiene x (con extremos acotados). */
function segment(xs: readonly number[], x: number): number {
	let lo = 0;
	let hi = xs.length - 1;
	if (x <= xs[0]!) return 0;
	if (x >= xs[hi]!) return hi - 1;
	while (hi - lo > 1) {
		const mid = (lo + hi) >> 1;
		if (xs[mid]! <= x) lo = mid;
		else hi = mid;
	}
	return lo;
}

/** Interpolacion lineal; fuera del rango repite el valor del extremo. */
export function linear(xs: readonly number[], ys: readonly number[]): Interpolant {
	assertStrictlyIncreasing(xs);
	return (x) => {
		if (x <= xs[0]!) return ys[0]!;
		if (x >= xs.at(-1)!) return ys.at(-1)!;
		const i = segment(xs, x);
		const t = (x - xs[i]!) / (xs[i + 1]! - xs[i]!);
		return ys[i]! + t * (ys[i + 1]! - ys[i]!);
	};
}

/**
 * PCHIP (Fritsch-Carlson / Fritsch-Butland): cubica de Hermite que preserva la monotonia de
 * los datos. Fuera del rango repite el valor del extremo, para no inventar respuesta.
 */
export function pchip(xs: readonly number[], ys: readonly number[]): Interpolant {
	assertStrictlyIncreasing(xs);
	const n = xs.length;
	if (n === 2) return linear(xs, ys);

	const h: number[] = [];
	const delta: number[] = [];
	for (let i = 0; i < n - 1; i++) {
		h.push(xs[i + 1]! - xs[i]!);
		delta.push((ys[i + 1]! - ys[i]!) / h[i]!);
	}

	const d: number[] = new Array<number>(n).fill(0);
	for (let i = 1; i < n - 1; i++) {
		const a = delta[i - 1]!;
		const b = delta[i]!;
		if (a === 0 || b === 0 || Math.sign(a) !== Math.sign(b)) {
			d[i] = 0;
		} else {
			const w1 = 2 * h[i]! + h[i - 1]!;
			const w2 = h[i]! + 2 * h[i - 1]!;
			d[i] = (w1 + w2) / (w1 / a + w2 / b);
		}
	}
	d[0] = pchipEndSlope(h[0]!, h[1]!, delta[0]!, delta[1]!);
	d[n - 1] = pchipEndSlope(h[n - 2]!, h[n - 3]!, delta[n - 2]!, delta[n - 3]!);

	return (x) => {
		if (x <= xs[0]!) return ys[0]!;
		if (x >= xs[n - 1]!) return ys[n - 1]!;
		const i = segment(xs, x);
		const hi = h[i]!;
		const t = (x - xs[i]!) / hi;
		const t2 = t * t;
		const t3 = t2 * t;
		return (
			(2 * t3 - 3 * t2 + 1) * ys[i]! +
			(t3 - 2 * t2 + t) * hi * d[i]! +
			(-2 * t3 + 3 * t2) * ys[i + 1]! +
			(t3 - t2) * hi * d[i + 1]!
		);
	};
}

function pchipEndSlope(h0: number, h1: number, del0: number, del1: number): number {
	let d = ((2 * h0 + h1) * del0 - h0 * del1) / (h0 + h1);
	if (Math.sign(d) !== Math.sign(del0)) d = 0;
	else if (Math.sign(del0) !== Math.sign(del1) && Math.abs(d) > Math.abs(3 * del0)) d = 3 * del0;
	return d;
}

/**
 * Spline cubica natural. Se usa para estimar como Photoshop/GIMP interpolan los puntos de
 * anclaje exportados (no para modelar datos: puede sobreoscilar).
 */
export function naturalCubic(xs: readonly number[], ys: readonly number[]): Interpolant {
	assertStrictlyIncreasing(xs);
	const n = xs.length;
	if (n === 2) return linear(xs, ys);

	// Sistema tridiagonal para las segundas derivadas (M0 = Mn-1 = 0).
	const m = new Array<number>(n).fill(0);
	const a = new Array<number>(n).fill(0);
	const b = new Array<number>(n).fill(0);
	const c = new Array<number>(n).fill(0);
	const r = new Array<number>(n).fill(0);
	for (let i = 1; i < n - 1; i++) {
		const h0 = xs[i]! - xs[i - 1]!;
		const h1 = xs[i + 1]! - xs[i]!;
		a[i] = h0;
		b[i] = 2 * (h0 + h1);
		c[i] = h1;
		r[i] = 6 * ((ys[i + 1]! - ys[i]!) / h1 - (ys[i]! - ys[i - 1]!) / h0);
	}
	// Thomas sobre los nodos interiores.
	for (let i = 2; i < n - 1; i++) {
		const f = a[i]! / b[i - 1]!;
		b[i] = b[i]! - f * c[i - 1]!;
		r[i] = r[i]! - f * r[i - 1]!;
	}
	for (let i = n - 2; i >= 1; i--) {
		m[i] = (r[i]! - (i < n - 2 ? c[i]! * m[i + 1]! : 0)) / b[i]!;
	}

	return (x) => {
		const i = segment(xs, x);
		const h = xs[i + 1]! - xs[i]!;
		const t = Math.min(Math.max(x, xs[0]!), xs[n - 1]!);
		const A = (xs[i + 1]! - t) / h;
		const B = (t - xs[i]!) / h;
		return (
			A * ys[i]! + B * ys[i + 1]! + (((A * A * A - A) * m[i]! + (B * B * B - B) * m[i + 1]!) * h * h) / 6
		);
	};
}
