import {
	buildTargetLayout,
	LayoutError,
	type TargetLayout,
	type TargetOptions
} from '$lib/core/target/layout';

export const STEP_CHOICES = [21, 31, 51, 101, 256] as const;
export const DPI_CHOICES = [300, 360, 720] as const;
export const PATCH_SIZES_MM = [14, 12, 10, 8, 6] as const;

export const DEFAULT_TARGET: TargetOptions = {
	paper: 'letter',
	steps: 51,
	patchSizeMm: 12,
	dpi: 300
};

export type LayoutResult = { layout: TargetLayout; error: null } | { layout: null; error: LayoutError };

export function tryLayout(options: TargetOptions): LayoutResult {
	try {
		return { layout: buildTargetLayout(options), error: null };
	} catch (error) {
		if (error instanceof LayoutError) return { layout: null, error };
		throw error;
	}
}

/** Mayor lado de parche de la lista que permite ubicar todos los parches. */
export function largestFittingPatch(options: TargetOptions): number | null {
	for (const size of PATCH_SIZES_MM) {
		if (tryLayout({ ...options, patchSizeMm: size }).layout) return size;
	}
	return null;
}

export function sameTarget(a: TargetOptions, b: TargetOptions): boolean {
	const keys: (keyof TargetOptions)[] = ['paper', 'customSizeMm', 'steps', 'patchSizeMm', 'dpi', 'seed'];
	return keys.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));
}

/**
 * Tamano minimo (mm, multiplos de 10) que admite las opciones actuales, manteniendo la
 * proporcion de la hoja pedida. Para explicar SHEET_TOO_SMALL con un numero util.
 */
export function minimumSheet(options: TargetOptions): [number, number] | null {
	const [w, h] = options.customSizeMm ?? [200, 250];
	for (let scale = 1; scale <= 12; scale += 0.05) {
		const size: [number, number] = [Math.ceil((w * scale) / 10) * 10, Math.ceil((h * scale) / 10) * 10];
		if (tryLayout({ ...options, paper: 'custom', customSizeMm: size }).layout) return size;
	}
	return null;
}
