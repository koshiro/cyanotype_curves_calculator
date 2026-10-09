import { describe, expect, it } from 'vitest';
import { calibrate } from '../curve/calibrate';
import { applyHomography, estimateHomography, reprojectionError, type Point } from '../image/homography';
import { srgbToLightness, yToLightness, lightnessToY, linearToSrgb } from '../image/color';
import { createImage } from '../image/types';
import { buildTargetLayout, type TargetLayout } from '../target/layout';
import { decodeMarkerBits, markerInk, SQUARE_TRANSFORMS, type MarkerId } from '../target/markers';
import { renderTarget } from '../target/render';
import { simulateScan, type ScanSimulation } from '../testing/simulate';
import { syntheticResponse } from '../testing/synthetic';
import { detectMarkers, locateTarget, ScanError } from './detect';
import { applyFlatField, estimateFlatField } from './flatfield';
import { measurePatches, toMeasuredPatches } from './measure';

/** Target chico a 100 DPI para que los tests corran rapido. */
const layout: TargetLayout = buildTargetLayout({ dpi: 100, steps: 21, seed: 11 });
const truth = syntheticResponse();

function canonicalBits(id: MarkerId): number[][] {
	return [1, 2, 3, 4].map((r) => [1, 2, 3, 4].map((c) => (markerInk(id, r, c) ? 1 : 0)));
}

function transformBits(bits: number[][], index: number): number[][] {
	const out = [0, 1, 2, 3].map(() => [0, 0, 0, 0]);
	const t = SQUARE_TRANSFORMS[index]!;
	for (let r = 0; r < 4; r++) {
		for (let c = 0; c < 4; c++) {
			const [u, v] = t((c + 0.5) / 4, (r + 0.5) / 4);
			out[Math.floor(v * 4)]![Math.floor(u * 4)] = bits[r]![c]!;
		}
	}
	return out;
}

describe('marcas', () => {
	it('cada id se decodifica en sus 8 orientaciones y con hasta 2 bits erroneos', () => {
		for (const id of [0, 1, 2, 3] as const) {
			for (let t = 0; t < 8; t++) {
				const read = transformBits(canonicalBits(id), t);
				expect(decodeMarkerBits(read)).toMatchObject({ id, transform: t, bitErrors: 0 });
				read[0]![0] = read[0]![0]! ^ 1;
				read[3]![2] = read[3]![2]! ^ 1;
				expect(decodeMarkerBits(read)).toMatchObject({ id, bitErrors: 2 });
			}
		}
	});

	it('un patron cualquiera no se confunde con una marca', () => {
		const solid = [0, 1, 2, 3].map(() => [1, 1, 1, 1]);
		expect(decodeMarkerBits(solid)).toBeNull();
	});
});

describe('render', () => {
	it('dibuja parches con su valor y marcas con borde de tinta', () => {
		const pixels = renderTarget(layout);
		const patch = layout.patches[5]!;
		const [x0, y0, x1, y1] = patch.box;
		expect(pixels[Math.floor((y0 + y1) / 2) * layout.width + Math.floor((x0 + x1) / 2)]).toBe(patch.value);
		const marker = layout.markers[0]!;
		const edge =
			Math.round(marker.center[1] - marker.size / 2 + 1) * layout.width + Math.round(marker.center[0]);
		expect(pixels[edge]).toBe(0);
	});
});

describe('homografia', () => {
	it('recupera una transformacion proyectiva conocida', () => {
		const h = [1.2, 0.1, 30, -0.05, 0.9, 12, 0.0001, -0.00005, 1];
		const from: Point[] = [
			[0, 0],
			[800, 0],
			[800, 1000],
			[0, 1000],
			[400, 500],
			[123, 877]
		];
		const to = from.map((p) => applyHomography(h, p));
		const estimated = estimateHomography(from, to);
		expect(reprojectionError(estimated, from, to)).toBeLessThan(1e-6);
	});
});

describe('color', () => {
	it('L* ↔ Y es consistente y el gris medio da L* 50', () => {
		expect(yToLightness(lightnessToY(37.5))).toBeCloseTo(37.5, 6);
		const mid = linearToSrgb(lightnessToY(50));
		expect(srgbToLightness(mid, mid, mid)).toBeCloseTo(50, 3);
	});
});

describe('deteccion de marcas', () => {
	it.each<[string, ScanSimulation]>([
		['copia derecha', { rotationDegrees: 0 }],
		['copia girada 93 grados', { rotationDegrees: 93 }],
		['copia al reves', { rotationDegrees: 180 }],
		['copia espejada y girada', { rotationDegrees: 268, mirror: true }],
		['escaneo a mayor resolucion', { rotationDegrees: 2, scale: 1.7 }],
		['escaneo del negativo (polaridad normal)', { scanNegative: true, rotationDegrees: 4 }]
	])('%s', (_, sim) => {
		const scan = simulateScan(layout, { noise: 0.01, seed: 3, ...sim });
		const location = locateTarget(scan, layout);
		expect(location.markers.map((m) => m.id)).toEqual([0, 1, 2, 3]);
		expect(location.mirrored).toBe(Boolean(sim.mirror));
		expect(location.reprojectionError).toBeLessThan(1.5 * (sim.scale ?? 1));
		const expectedPolarity = sim.scanNegative ? 'normal' : 'inverted';
		for (const m of location.markers) expect(m.polarity).toBe(expectedPolarity);
		// El centro del target debe caer donde lo puso la simulacion.
		const [cx, cy] = applyHomography(location.homography, [layout.width / 2, layout.height / 2]);
		expect(Math.abs(cx - scan.width / 2)).toBeLessThan(2);
		expect(Math.abs(cy - scan.height / 2)).toBeLessThan(2);
	});

	it('informa que marcas faltan cuando no hay target', () => {
		const blank = createImage(400, 500, 3);
		blank.data.fill(0.9);
		expect(detectMarkers(blank)).toHaveLength(0);
		try {
			locateTarget(blank, layout);
			expect.unreachable();
		} catch (error) {
			expect((error as ScanError).code).toBe('MARKERS_NOT_FOUND');
		}
	});
});

describe('medicion y calibracion de punta a punta', () => {
	const scan = simulateScan(layout, { rotationDegrees: 91.5, noise: 0.01, seed: 5 });
	const location = locateTarget(scan, layout);
	const measurements = measurePatches(scan, layout, location.homography);

	it('mide L* de cada parche con error menor a 0.5', () => {
		for (const m of measurements) expect(Math.abs(m.lightness - truth(m.patch.value))).toBeLessThan(0.5);
	});

	it('la densidad roja crece con la exposicion (n mayor = mas azul)', () => {
		const byValue = [...measurements].sort((a, b) => a.patch.value - b.patch.value);
		expect(byValue.at(-1)!.redDensity).toBeGreaterThan(byValue[0]!.redDensity + 0.3);
	});

	it('la calibracion obtenida linealiza la respuesta real', () => {
		const result = calibrate(toMeasuredPatches(measurements));
		const best = result.candidates[0]!;
		const { white, black } = best.curve!.lightness;
		for (let p = 0; p <= 255; p += 15) {
			const printed = truth(best.curve!.negative[p]!);
			expect(Math.abs(printed - (black + ((white - black) * p) / 255))).toBeLessThan(1);
		}
	});
});

describe('campo plano', () => {
	it('detecta y corrige una exposicion despareja', () => {
		const sheet = [layout.paper.widthMm, layout.paper.heightMm] as const;
		const scan = simulateScan(layout, { exposureGradient: 0.06, noise: 0.005, seed: 9 });
		const location = locateTarget(scan, layout);
		const patches = toMeasuredPatches(measurePatches(scan, layout, location.homography));
		const field = estimateFlatField(patches, sheet)!;
		expect(field).not.toBeNull();
		expect(field.spanL).toBeGreaterThan(5);

		const spread = (list: typeof patches) => {
			const refs = list.filter((p) => p.value === field.referenceValue).map((p) => p.lightness);
			return Math.max(...refs) - Math.min(...refs);
		};
		expect(spread(applyFlatField(patches, field))).toBeLessThan(spread(patches) / 2);
	});

	it('sin degradado el campo estimado es casi plano', () => {
		const scan = simulateScan(layout, { noise: 0.005, seed: 9 });
		const location = locateTarget(scan, layout);
		const patches = toMeasuredPatches(measurePatches(scan, layout, location.homography));
		expect(estimateFlatField(patches, [layout.paper.widthMm, layout.paper.heightMm])!.spanL).toBeLessThan(1);
	});
});

describe('analyzeScan', () => {
	it('reune ubicacion, mediciones, campo plano y avisos', async () => {
		const { analyzeScan } = await import('./analyze');
		const scan = simulateScan(layout, {
			rotationDegrees: 180,
			mirror: true,
			exposureGradient: 0.06,
			noise: 0.005
		});
		const result = analyzeScan(scan, layout);
		const codes = result.diagnostics.map((d) => d.code);
		expect(codes).toContain('MIRRORED');
		expect(codes).toContain('UNEVEN_EXPOSURE');
		expect(codes).not.toContain('EIGHT_BIT_SCAN');
		expect(result.flatFieldApplied).toBe(true);
		expect(result.patches).toHaveLength(layout.patches.length);
		expect(calibrate(result.patches).recommended).not.toBeNull();
	});

	it('avisa de escaneos de 8 bits y de resolucion insuficiente', async () => {
		const { analyzeScan } = await import('./analyze');
		const small = buildTargetLayout({ dpi: 100, steps: 21, patchSizeMm: 12 });
		const scan = { ...simulateScan(small, { scale: 0.4, noise: 0.005 }), bitDepth: 8 };
		const codes = analyzeScan(scan, small).diagnostics.map((d) => d.code);
		expect(codes).toContain('EIGHT_BIT_SCAN');
		expect(codes).toContain('LOW_SCAN_RESOLUTION');
	});
});
