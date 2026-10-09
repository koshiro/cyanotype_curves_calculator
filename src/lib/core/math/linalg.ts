/**
 * Algebra lineal minima para sistemas pequenos (≤ ~40 incognitas) densos y simetricos
 * definidos positivos, como las ecuaciones normales de una P-spline.
 */

export type Matrix = number[][];

export function zeros(rows: number, cols: number): Matrix {
	return Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
}

/** Factoriza A = L·Lᵀ (Cholesky). Lanza si A no es definida positiva. */
export function cholesky(a: Matrix): Matrix {
	const n = a.length;
	const l = zeros(n, n);
	for (let i = 0; i < n; i++) {
		for (let j = 0; j <= i; j++) {
			let sum = a[i]![j]!;
			for (let k = 0; k < j; k++) sum -= l[i]![k]! * l[j]![k]!;
			if (i === j) {
				if (!(sum > 0)) throw new Error('cholesky: la matriz no es definida positiva');
				l[i]![i] = Math.sqrt(sum);
			} else {
				l[i]![j] = sum / l[j]![j]!;
			}
		}
	}
	return l;
}

/** Resuelve L·Lᵀ·x = b dado el factor de Cholesky L. */
export function choleskySolve(l: Matrix, b: readonly number[]): number[] {
	const n = l.length;
	const y = new Array<number>(n).fill(0);
	for (let i = 0; i < n; i++) {
		let sum = b[i]!;
		for (let k = 0; k < i; k++) sum -= l[i]![k]! * y[k]!;
		y[i] = sum / l[i]![i]!;
	}
	const x = new Array<number>(n).fill(0);
	for (let i = n - 1; i >= 0; i--) {
		let sum = y[i]!;
		for (let k = i + 1; k < n; k++) sum -= l[k]![i]! * x[k]!;
		x[i] = sum / l[i]![i]!;
	}
	return x;
}
