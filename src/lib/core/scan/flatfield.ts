/**
 * Falta de uniformidad de la exposicion (campo plano).
 *
 * Modelo fisico: mas exposicion en una zona equivale a un negativo algo mas transparente ahi.
 * Si el campo desplaza el valor efectivo del negativo en δ(x, y) = a·dx + b·dy (en unidades de
 * n), cada parche cambia ΔL* ≈ L'(n)·δ, donde L'(n) es la pendiente de la respuesta en su tono.
 * Por eso el blanco del papel y el negro maximo (pendiente casi nula) apenas se mueven y los
 * tonos medios si.
 *
 * Se estima (a, b) con todos los valores repetidos a la vez, como regresion con un nivel propio
 * por valor (efectos fijos) y regresores L'(n)·dx, L'(n)·dy. Solo se declara significativo si
 * la prueba F (2, gl) supera el nivel α = 0.01: con la variacion normal entre parches de una
 * copia uniforme no hay falsos positivos.
 */
import type { MeasuredPatch } from '../curve/types';

export interface FlatField {
	/** Desplazamiento equivalente del negativo, en unidades de n por mm. */
	slopeX: number;
	slopeY: number;
	center: [number, number];
	/** Rango del desplazamiento equivalente (n) dentro de la zona cubierta por las repeticiones. */
	spanN: number;
	/** Diferencia maxima de L* que produce ese rango en el tono mas sensible. */
	spanL: number;
	/** true si la prueba F rechaza "exposicion uniforme" con α = 0.01. */
	significant: boolean;
	fStatistic: number;
	degreesOfFreedom: number;
	/** Pendiente d(L*)/dn por valor, usada para aplicar la correccion. */
	sensitivity: { value: number; slope: number }[];
	samples: number;
}

const ALPHA = 0.01;

/** Valor critico de F(2, ν): P(F > f) = (1 + 2f/ν)^(−ν/2), exacto para 2 grados en el numerador. */
export function fCritical2(nu: number, alpha = ALPHA): number {
	return (nu / 2) * (alpha ** (-2 / nu) - 1);
}

/** Pendiente local d(L*)/dn por valor, con regresion lineal en una ventana de ±`window` valores. */
function sensitivityTable(
	patches: readonly MeasuredPatch[],
	window = 24
): { value: number; slope: number }[] {
	const means = new Map<number, { sum: number; count: number }>();
	for (const p of patches) {
		const m = means.get(p.value) ?? { sum: 0, count: 0 };
		m.sum += p.lightness;
		m.count++;
		means.set(p.value, m);
	}
	const points = [...means.entries()]
		.map(([value, m]) => ({ value, l: m.sum / m.count }))
		.sort((a, b) => a.value - b.value);
	return points.map(({ value }) => {
		const near = points.filter((p) => Math.abs(p.value - value) <= window);
		const mx = near.reduce((s, p) => s + p.value, 0) / near.length;
		const my = near.reduce((s, p) => s + p.l, 0) / near.length;
		let num = 0;
		let den = 0;
		for (const p of near) {
			num += (p.value - mx) * (p.l - my);
			den += (p.value - mx) ** 2;
		}
		return { value, slope: den > 0 ? num / den : 0 };
	});
}

function slopeAt(table: readonly { value: number; slope: number }[], value: number): number {
	if (table.length === 0) return 0;
	if (value <= table[0]!.value) return table[0]!.slope;
	if (value >= table.at(-1)!.value) return table.at(-1)!.slope;
	const j = table.findIndex((t) => t.value >= value);
	const a = table[j - 1]!;
	const b = table[j]!;
	return a.slope + ((value - a.value) / (b.value - a.value)) * (b.slope - a.slope);
}

export function estimateFlatField(patches: readonly MeasuredPatch[]): FlatField | null {
	const located = patches.filter((p) => p.positionMm);
	const sensitivity = sensitivityTable(located);
	const groups = new Map<number, MeasuredPatch[]>();
	for (const p of located) {
		const list = groups.get(p.value);
		if (list) list.push(p);
		else groups.set(p.value, [p]);
	}
	const repeated = [...groups.values()].filter((g) => g.length >= 2);
	const n = repeated.reduce((s, g) => s + g.length, 0);
	const dof = n - repeated.length - 2;
	if (repeated.length === 0 || dof < 2) return null;

	const all = repeated.flat();
	const cx = all.reduce((s, p) => s + p.positionMm![0], 0) / all.length;
	const cy = all.reduce((s, p) => s + p.positionMm![1], 0) / all.length;

	// Regresion con efectos fijos: se quita la media de cada grupo a respuesta y regresores.
	let sxx = 0;
	let sxy = 0;
	let syy = 0;
	let sxr = 0;
	let syr = 0;
	let srr = 0;
	for (const group of repeated) {
		const s = slopeAt(sensitivity, group[0]!.value);
		const rows = group.map((p) => ({
			x: s * (p.positionMm![0] - cx),
			y: s * (p.positionMm![1] - cy),
			r: p.lightness
		}));
		const mx = rows.reduce((t, r) => t + r.x, 0) / rows.length;
		const my = rows.reduce((t, r) => t + r.y, 0) / rows.length;
		const mr = rows.reduce((t, r) => t + r.r, 0) / rows.length;
		for (const row of rows) {
			const x = row.x - mx;
			const y = row.y - my;
			const r = row.r - mr;
			sxx += x * x;
			sxy += x * y;
			syy += y * y;
			sxr += x * r;
			syr += y * r;
			srr += r * r;
		}
	}
	const det = sxx * syy - sxy * sxy;
	if (!(det > 1e-12)) return null;
	const a = (sxr * syy - syr * sxy) / det;
	const b = (syr * sxx - sxr * sxy) / det;
	const explained = a * sxr + b * syr;
	const rss = Math.max(srr - explained, 1e-12);
	const fStatistic = explained / 2 / (rss / dof);

	// Rango del campo dentro de la envolvente de las repeticiones (sin extrapolar a la hoja).
	const deltas = all.map((p) => a * (p.positionMm![0] - cx) + b * (p.positionMm![1] - cy));
	const spanN = Math.max(...deltas) - Math.min(...deltas);
	const maxSlope = Math.max(...sensitivity.map((t) => Math.abs(t.slope)));
	return {
		slopeX: a,
		slopeY: b,
		center: [cx, cy],
		spanN: round(spanN),
		spanL: round(spanN * maxSlope),
		significant: fStatistic > fCritical2(dof),
		fStatistic: round(fStatistic),
		degreesOfFreedom: dof,
		sensitivity,
		samples: n
	};
}

/** Resta a cada parche el efecto del campo segun la pendiente de su tono. */
export function applyFlatField(patches: readonly MeasuredPatch[], field: FlatField): MeasuredPatch[] {
	return patches.map((p) => {
		if (!p.positionMm) return p;
		const delta =
			field.slopeX * (p.positionMm[0] - field.center[0]) + field.slopeY * (p.positionMm[1] - field.center[1]);
		const offset = slopeAt(field.sensitivity, p.value) * delta;
		return { ...p, lightness: Math.min(Math.max(p.lightness - offset, 0), 100) };
	});
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}
