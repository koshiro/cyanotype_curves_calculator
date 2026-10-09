/**
 * Falta de uniformidad de la exposicion (campo plano) estimada con los parches de referencia
 * repetidos por la hoja.
 *
 * Para cada valor de referencia repetido se toman los residuos L* − media(L* de ese valor) y
 * se ajusta un plano a(x − x̄) + b(y − ȳ). Se usa el valor de referencia mas sensible (el que
 * muestra mayor dispersion), porque el blanco del papel y el negro maximo apenas responden a
 * variaciones de exposicion. La correccion es aditiva en L* y opcional.
 */
import type { MeasuredPatch } from '../curve/types';

export interface FlatField {
	/** Pendientes en L* por mm. */
	slopeX: number;
	slopeY: number;
	center: [number, number];
	/** Diferencia de L* entre los extremos de la hoja segun el plano. */
	spanL: number;
	/** Valor de referencia usado para estimarlo. */
	referenceValue: number;
	/** Repeticiones usadas. */
	samples: number;
}

export function estimateFlatField(
	patches: readonly MeasuredPatch[],
	sheetMm: readonly [number, number]
): FlatField | null {
	const groups = new Map<number, MeasuredPatch[]>();
	for (const p of patches) {
		if (!p.positionMm) continue;
		const list = groups.get(p.value);
		if (list) list.push(p);
		else groups.set(p.value, [p]);
	}
	let chosen: { value: number; list: MeasuredPatch[]; spread: number } | null = null;
	for (const [value, list] of groups) {
		if (list.length < 3) continue;
		const mean = list.reduce((s, p) => s + p.lightness, 0) / list.length;
		const spread = Math.sqrt(list.reduce((s, p) => s + (p.lightness - mean) ** 2, 0) / (list.length - 1));
		if (!chosen || spread > chosen.spread) chosen = { value, list, spread };
	}
	if (!chosen) return null;

	const pts = chosen.list;
	const mean = pts.reduce((s, p) => s + p.lightness, 0) / pts.length;
	const cx = pts.reduce((s, p) => s + p.positionMm![0], 0) / pts.length;
	const cy = pts.reduce((s, p) => s + p.positionMm![1], 0) / pts.length;
	// Minimos cuadrados de r = a·dx + b·dy (2×2).
	let sxx = 0;
	let sxy = 0;
	let syy = 0;
	let sxr = 0;
	let syr = 0;
	for (const p of pts) {
		const dx = p.positionMm![0] - cx;
		const dy = p.positionMm![1] - cy;
		const r = p.lightness - mean;
		sxx += dx * dx;
		sxy += dx * dy;
		syy += dy * dy;
		sxr += dx * r;
		syr += dy * r;
	}
	const det = sxx * syy - sxy * sxy;
	if (Math.abs(det) < 1e-9) return null;
	const slopeX = (sxr * syy - syr * sxy) / det;
	const slopeY = (syr * sxx - sxr * sxy) / det;
	const spanL = Math.abs(slopeX) * sheetMm[0] + Math.abs(slopeY) * sheetMm[1];
	return {
		slopeX,
		slopeY,
		center: [cx, cy],
		spanL: Math.round(spanL * 100) / 100,
		referenceValue: chosen.value,
		samples: pts.length
	};
}

export function applyFlatField(patches: readonly MeasuredPatch[], field: FlatField): MeasuredPatch[] {
	return patches.map((p) => {
		if (!p.positionMm) return p;
		const offset =
			field.slopeX * (p.positionMm[0] - field.center[0]) + field.slopeY * (p.positionMm[1] - field.center[1]);
		return { ...p, lightness: Math.min(Math.max(p.lightness - offset, 0), 100) };
	});
}
