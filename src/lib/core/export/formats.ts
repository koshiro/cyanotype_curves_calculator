/**
 * Formatos de curva. Referencias:
 * - Adobe Photoshop File Formats Specification, secciones "Curves" y "Arbitrary Map".
 *   .acv: version 4 = cantidad de curvas; cada curva: n puntos (2..19) y pares (salida, entrada).
 *   La primera curva es la maestra. La version Python escribia "version 5" (no existe) y una
 *   variante "version 1" con un conteo que Photoshop interpreta como mapa de bits.
 *   .amp: una o mas tablas de 256 bytes; con una sola tabla Photoshop la aplica al canal
 *   compuesto, o al unico canal activo en Escala de grises. Es exacta: formato recomendado.
 * - GIMP ≥ 2.10: preset de texto `(curve (curve-type free) (samples 256 ...))`; con "free"
 *   GIMP usa las muestras tal cual, sin re-interpolar puntos.
 * - .cube: LUT 1D (Adobe/Resolve Cube LUT Specification 1.0), aplicada por igual a R, G y B.
 */
import { selectAnchors, type Anchor, type AnchorOptions } from './anchors';

function toBytes(samples: ArrayLike<number>): Uint8Array {
	if (samples.length !== 256) throw new Error('Se esperan 256 muestras');
	return Uint8Array.from(samples, (v) => Math.round(Math.min(Math.max(v, 0), 255)));
}

const IDENTITY: readonly Anchor[] = [
	[0, 0],
	[255, 255]
];

export function encodeAcv(samples: ArrayLike<number>, options: AnchorOptions = {}): Uint8Array {
	const { anchors } = selectAnchors(samples, options);
	// Maestra + 4 curvas nulas (R, G, B y una extra), como guarda Photoshop en RGB.
	const curves: readonly (readonly Anchor[])[] = [anchors, IDENTITY, IDENTITY, IDENTITY, IDENTITY];
	const size = 4 + curves.reduce((s, c) => s + 2 + c.length * 4, 0);
	const view = new DataView(new ArrayBuffer(size));
	let offset = 0;
	const put = (v: number) => {
		view.setUint16(offset, v, false);
		offset += 2;
	};
	put(4);
	put(curves.length);
	for (const curve of curves) {
		put(curve.length);
		for (const [input, output] of curve) {
			put(output);
			put(input);
		}
	}
	return new Uint8Array(view.buffer);
}

/** Lee la curva maestra de un .acv (version 4) y la interpola linealmente a 256 niveles. */
export function decodeAcvMaster(data: Uint8Array): { anchors: Anchor[]; samples: Float64Array } {
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	if (data.byteLength < 6) throw new Error('.acv incompleto');
	const version = view.getUint16(0, false);
	if (version !== 4) throw new Error(`.acv version ${version} no soportada (se espera 4)`);
	const count = view.getUint16(4, false);
	if (count < 2 || count > 19 || data.byteLength < 6 + count * 4)
		throw new Error('.acv con puntos invalidos');
	const anchors: Anchor[] = [];
	for (let i = 0; i < count; i++) {
		const output = view.getUint16(6 + i * 4, false);
		const input = view.getUint16(8 + i * 4, false);
		anchors.push([input, output]);
	}
	anchors.sort((a, b) => a[0] - b[0]);
	const samples = new Float64Array(256);
	for (let x = 0; x < 256; x++) {
		const j = anchors.findIndex(([input]) => input >= x);
		if (j === -1) samples[x] = anchors.at(-1)![1];
		else if (j === 0) samples[x] = anchors[0]![1];
		else {
			const [x0, y0] = anchors[j - 1]!;
			const [x1, y1] = anchors[j]!;
			samples[x] = y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
		}
	}
	return { anchors, samples };
}

export function encodeAmp(samples: ArrayLike<number>): Uint8Array {
	return toBytes(samples);
}

export function decodeAmp(data: Uint8Array): Float64Array {
	if (data.byteLength === 0 || data.byteLength % 256 !== 0) {
		throw new Error('.amp debe medir un multiplo de 256 bytes');
	}
	return Float64Array.from(data.subarray(0, 256));
}

export function encodeGimpCurves(samples: ArrayLike<number>): string {
	const bytes = Array.from(samples, (v) => Math.min(Math.max(v, 0), 255) / 255);
	if (bytes.length !== 256) throw new Error('Se esperan 256 muestras');
	const { anchors } = selectAnchors(samples, { maxPoints: 17 });
	const points = anchors.flatMap(([x, y]) => [x / 255, y / 255]);
	return [
		'# GIMP curves tool settings',
		'',
		'(time 0)',
		'(channel value)',
		'(curve',
		'    (curve-type free)',
		`    (n-points ${anchors.length})`,
		`    (points ${points.length} ${points.map(fmt).join(' ')})`,
		'    (n-samples 256)',
		`    (samples 256 ${bytes.map(fmt).join(' ')}))`,
		''
	].join('\n');
}

export function decodeGimpCurves(text: string): Float64Array {
	const match = /\(samples\s+256\s+([^)]+)\)/.exec(text);
	if (!match) throw new Error('No se encontro `(samples 256 ...)` en el preset de GIMP');
	const values = match[1]!.trim().split(/\s+/).map(Number);
	if (values.length !== 256 || values.some((v) => !Number.isFinite(v))) {
		throw new Error('El preset de GIMP debe tener 256 muestras numericas');
	}
	return Float64Array.from(values, (v) => v * 255);
}

export function encodeCube(samples: ArrayLike<number>, title = 'Cyano Curve'): string {
	if (samples.length !== 256) throw new Error('Se esperan 256 muestras');
	const lines = [
		`TITLE "${title.replace(/"/g, "'")}"`,
		'LUT_1D_SIZE 256',
		'DOMAIN_MIN 0.0 0.0 0.0',
		'DOMAIN_MAX 1.0 1.0 1.0'
	];
	for (let i = 0; i < 256; i++) {
		const v = fmt(Math.min(Math.max(samples[i]!, 0), 255) / 255);
		lines.push(`${v} ${v} ${v}`);
	}
	return lines.join('\n') + '\n';
}

function fmt(value: number): string {
	return value.toFixed(6);
}
