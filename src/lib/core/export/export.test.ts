import { describe, expect, it } from 'vitest';
import { naturalCubic } from '../math/interpolate';
import { selectAnchors } from './anchors';
import {
	decodeAcvMaster,
	decodeAmp,
	decodeGimpCurves,
	encodeAcv,
	encodeAmp,
	encodeCube,
	encodeGimpCurves
} from './formats';

/** Curva de prueba con codo pronunciado en sombras y endpoints fuera de 0/255. */
const samples = Float64Array.from({ length: 256 }, (_, p) => 20 + 215 * Math.pow(p / 255, 0.55));

describe('selectAnchors', () => {
	it('respeta la tolerancia con pocos puntos', () => {
		const { anchors, maxError } = selectAnchors(samples);
		expect(maxError).toBeLessThanOrEqual(0.5);
		expect(anchors.length).toBeLessThanOrEqual(16);
		expect(anchors[0]![0]).toBe(0);
		expect(anchors.at(-1)![0]).toBe(255);
		const spline = naturalCubic(
			anchors.map((a) => a[0]),
			anchors.map((a) => a[1])
		);
		for (let x = 0; x < 256; x++) expect(Math.abs(spline(x) - samples[x]!)).toBeLessThan(1.01);
	});

	it('una recta necesita solo los extremos', () => {
		const line = Float64Array.from({ length: 256 }, (_, p) => p);
		expect(selectAnchors(line).anchors).toHaveLength(2);
	});
});

describe('.acv', () => {
	it('sigue la especificacion de Adobe (version 4, maestra + nulas)', () => {
		const data = encodeAcv(samples);
		const view = new DataView(data.buffer);
		expect(view.getUint16(0)).toBe(4);
		expect(view.getUint16(2)).toBe(5);
		const points = view.getUint16(4);
		expect(points).toBeGreaterThanOrEqual(2);
		expect(points).toBeLessThanOrEqual(19);
		// Primer punto: (salida, entrada) = (C(0), 0).
		expect(view.getUint16(6)).toBe(20);
		expect(view.getUint16(8)).toBe(0);
		// Curvas nulas: 2 0 0 255 255.
		const nullOffset = 6 + points * 4;
		expect([0, 2, 4, 6, 8].map((o) => view.getUint16(nullOffset + o))).toEqual([2, 0, 0, 255, 255]);
		expect(data.byteLength).toBe(4 + (2 + points * 4) + 4 * 10);
	});

	it('se puede volver a leer', () => {
		const { samples: decoded } = decodeAcvMaster(encodeAcv(samples));
		for (let x = 0; x < 256; x++) expect(Math.abs(decoded[x]! - samples[x]!)).toBeLessThan(2.5);
	});

	it('rechaza versiones fuera de la especificacion', () => {
		const bad = encodeAcv(samples);
		bad[1] = 5;
		expect(() => decodeAcvMaster(bad)).toThrow();
	});
});

describe('.amp', () => {
	it('es una tabla exacta de 256 bytes', () => {
		const data = encodeAmp(samples);
		expect(data.byteLength).toBe(256);
		const decoded = decodeAmp(data);
		for (let x = 0; x < 256; x++) expect(Math.abs(decoded[x]! - samples[x]!)).toBeLessThanOrEqual(0.5);
	});
});

describe('GIMP', () => {
	it('escribe muestras exactas en modo libre y se puede leer', () => {
		const text = encodeGimpCurves(samples);
		expect(text).toContain('(curve-type free)');
		const decoded = decodeGimpCurves(text);
		for (let x = 0; x < 256; x++) expect(decoded[x]).toBeCloseTo(samples[x]!, 3);
	});
});

describe('.cube', () => {
	it('declara una LUT 1D de 256 entradas normalizadas', () => {
		const lines = encodeCube(samples).trim().split('\n');
		expect(lines).toContain('LUT_1D_SIZE 256');
		const entries = lines.filter((l) => /^[\d.]+ [\d.]+ [\d.]+$/.test(l));
		expect(entries).toHaveLength(256);
		expect(Number(entries[255]!.split(' ')[0])).toBeCloseTo(samples[255]! / 255, 5);
	});
});
