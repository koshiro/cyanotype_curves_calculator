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
