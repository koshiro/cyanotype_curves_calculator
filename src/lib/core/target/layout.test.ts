import { describe, expect, it } from 'vitest';
import { buildTargetLayout, LayoutError, patchCenterMm, stepValues, type Box } from './layout';

function overlaps(a: Box, b: Box): boolean {
	return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
}

describe('stepValues', () => {
	it('cubre 0..255 de forma equiespaciada', () => {
		expect(stepValues(5)).toEqual([0, 64, 128, 191, 255]);
	});
});

describe('buildTargetLayout', () => {
	const layout = buildTargetLayout();

	it('usa medidas fisicas: carta a 300 DPI', () => {
		expect(layout.width).toBe(2550);
		expect(layout.height).toBe(3300);
		expect(layout.schema).toBe('cyano-curve/target-layout');
		expect(layout.version).toBe(2);
	});

	it('incluye todos los pasos y las referencias repetidas', () => {
		const steps = layout.patches.filter((p) => p.role === 'step');
		const refs = layout.patches.filter((p) => p.role === 'reference');
		expect(steps).toHaveLength(51);
		expect(refs).toHaveLength(12);
		expect(new Set(refs.map((p) => p.value))).toEqual(new Set([0, 128, 255]));
	});

	it('ningun parche se solapa con otro, con las marcas ni sale de la hoja', () => {
		const markerBoxes = layout.markers.map(({ center: [x, y], size }) => {
			const half = size; // marca + zona de silencio
			return [x - half, y - half, x + half, y + half] as const;
		});
		for (const [i, patch] of layout.patches.entries()) {
			expect(patch.box[0]).toBeGreaterThanOrEqual(0);
			expect(patch.box[2]).toBeLessThanOrEqual(layout.width);
			expect(patch.box[3]).toBeLessThanOrEqual(layout.height);
			for (const marker of markerBoxes) expect(overlaps(patch.box, marker)).toBe(false);
			for (const other of layout.patches.slice(i + 1)) expect(overlaps(patch.box, other.box)).toBe(false);
		}
	});

	it('marcas con identidad en las cuatro esquinas', () => {
		expect(layout.markers.map((m) => m.id)).toEqual([0, 1, 2, 3]);
		const [tl, tr, br, bl] = layout.markers;
		expect(tl!.center[0]).toBeLessThan(tr!.center[0]);
		expect(br!.center[1]).toBeGreaterThan(tr!.center[1]);
		expect(bl!.center[0]).toBe(tl!.center[0]);
	});

	it('aleatoriza de forma determinista segun la semilla', () => {
		const again = buildTargetLayout();
		const other = buildTargetLayout({ seed: 99 });
		const plain = buildTargetLayout({ randomize: false });
		const values = (l: typeof layout) => l.patches.map((p) => p.value);
		expect(values(again)).toEqual(values(layout));
		expect(values(other)).not.toEqual(values(layout));
		expect(values(plain).slice(0, 3)).toEqual([0, 5, 10]);
	});

	it('soporta A4, tamano personalizado y valores explicitos', () => {
		const a4 = buildTargetLayout({
			paper: 'a4',
			dpi: 360,
			values: [0, 10, 200, 255],
			referenceReplicates: 1
		});
		expect(a4.width).toBe(Math.round((210 / 25.4) * 360));
		expect(a4.patches).toHaveLength(7);
		const custom = buildTargetLayout({ paper: 'custom', customSizeMm: [180, 240], steps: 21 });
		expect(custom.paper.widthMm).toBe(180);
	});

	it('explica cuando los parches no caben', () => {
		try {
			buildTargetLayout({ steps: 256, patchSizeMm: 20 });
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(LayoutError);
			expect((error as LayoutError).code).toBe('DOES_NOT_FIT');
		}
	});

	it.each([
		['dpi', { dpi: 0 }],
		['valores de referencia', { referenceValues: [Number.NaN] }],
		['referencia fuera de rango', { referenceValues: [300] }],
		['repeticiones negativas', { referenceReplicates: -1 }],
		['parche nulo', { patchSizeMm: 0 }]
	])('rechaza opciones invalidas: %s', (_, options) => {
		try {
			buildTargetLayout(options);
			expect.unreachable();
		} catch (error) {
			expect((error as LayoutError).code).toBe('INVALID_OPTIONS');
		}
	});

	it('una hoja sin espacio entre las marcas da SHEET_TOO_SMALL, nunca una capacidad negativa', () => {
		try {
			buildTargetLayout({ paper: 'custom', customSizeMm: [60, 60], steps: 21 });
			expect.unreachable();
		} catch (error) {
			expect((error as LayoutError).code).toBe('SHEET_TOO_SMALL');
		}
	});

	it('256 pasos caben en carta con parches de 8 mm', () => {
		expect(buildTargetLayout({ steps: 256, patchSizeMm: 8 }).patches).toHaveLength(268);
	});

	it('convierte posiciones a mm', () => {
		const [x, y] = patchCenterMm(layout, layout.patches[0]!);
		expect(x).toBeGreaterThan(10);
		expect(y).toBeGreaterThan(10);
		expect(x).toBeLessThan(215.9);
	});
});
