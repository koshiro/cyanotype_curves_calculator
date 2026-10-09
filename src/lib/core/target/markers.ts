/**
 * Marcas de registro propias: grilla de 6×6 modulos con borde de tinta y 4×4 bits internos.
 *
 * Los cuatro codigos se eligieron por busqueda exhaustiva: entre cualquier par de marcas, y
 * entre una marca y sus propias rotaciones/espejos, la distancia de Hamming minima es 6. Asi
 * se identifica cada esquina (y por lo tanto el giro y el espejado del escaneo) corrigiendo
 * hasta 2 bits mal leidos. No dependen de ArUco, cuyo soporte en el navegador es fragil.
 */

export const MARKER_MODULES = 6;
export const MARKER_CODES = [0x6121, 0x7b1d, 0x16a3, 0x60ae] as const;
export const MAX_BIT_ERRORS = 2;

export type MarkerId = 0 | 1 | 2 | 3;

/** true = tinta (negro en el negativo) para el modulo (fila, columna) de la marca `id`. */
export function markerInk(id: MarkerId, row: number, column: number): boolean {
	if (row <= 0 || column <= 0 || row >= MARKER_MODULES - 1 || column >= MARKER_MODULES - 1) return true;
	const bit = (row - 1) * 4 + (column - 1);
	return ((MARKER_CODES[id] >> (15 - bit)) & 1) === 1;
}

/** Transformacion del cuadrado unidad: coordenadas canonicas (u, v) → coordenadas leidas. */
export type SquareTransform = (u: number, v: number) => [number, number];

/** Las 8 simetrias del cuadrado (4 rotaciones, con y sin espejo). */
export const SQUARE_TRANSFORMS: readonly SquareTransform[] = (() => {
	const rotate =
		(t: SquareTransform): SquareTransform =>
		(u, v) => {
			const [a, b] = t(u, v);
			return [1 - b, a];
		};
	const identity: SquareTransform = (u, v) => [u, v];
	const mirror: SquareTransform = (u, v) => [1 - u, v];
	const out: SquareTransform[] = [];
	for (const base of [identity, mirror]) {
		let t = base;
		for (let k = 0; k < 4; k++) {
			out.push(t);
			t = rotate(t);
		}
	}
	return out;
})();

export interface DecodedMarker {
	id: MarkerId;
	/** Indice en SQUARE_TRANSFORMS que lleva la marca canonica a como se leyo. */
	transform: number;
	bitErrors: number;
}

/**
 * Identifica una marca a partir de sus 4×4 bits leidos (`bits[fila][columna]`, 1 = tinta).
 * Devuelve null si ningun codigo queda a `MAX_BIT_ERRORS` o menos, o si hay empate.
 */
export function decodeMarkerBits(bits: readonly (readonly number[])[]): DecodedMarker | null {
	let best: DecodedMarker | null = null;
	let tie = false;
	for (let id = 0 as MarkerId; id < 4; id = (id + 1) as MarkerId) {
		for (const [index, transform] of SQUARE_TRANSFORMS.entries()) {
			let errors = 0;
			for (let r = 0; r < 4; r++) {
				for (let c = 0; c < 4; c++) {
					const [u, v] = transform((c + 0.5) / 4, (r + 0.5) / 4);
					const read = bits[Math.floor(v * 4)]![Math.floor(u * 4)]!;
					const expected = markerInk(id, r + 1, c + 1) ? 1 : 0;
					if (read !== expected) errors++;
				}
			}
			if (!best || errors < best.bitErrors) {
				best = { id, transform: index, bitErrors: errors };
				tie = false;
			} else if (errors === best.bitErrors) {
				tie = true;
			}
		}
	}
	if (!best || best.bitErrors > MAX_BIT_ERRORS || (tie && best.bitErrors > 0)) return null;
	return best;
}
