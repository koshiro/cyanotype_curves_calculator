/**
 * Convenciones del dominio (validas en todo el nucleo):
 *
 * - `value` (n): valor de gris 0..255 escrito en el **archivo del negativo** que va a la
 *   impresora. 0 = maxima tinta (bloquea UV), 255 = acetato transparente.
 * - `lightness` (L*): luminosidad CIE L* (0..100) medida en la copia de cianotipo.
 *   Mas tinta → menos UV → copia mas clara. Por eso L*(n) es **decreciente**.
 * - `p`: tono 0..255 de la imagen **positiva** que se quiere imprimir (0 = negro).
 * - Flujo de uso de la curva exportada: positivo → aplicar curva C → invertir → imprimir.
 *   Es decir, n(p) = 255 − C(p).
 */

export interface MeasuredPatch {
	/** Valor enviado al negativo (0..255). */
	value: number;
	/** L* medido en la copia (0..100). */
	lightness: number;
	/** Peso relativo (p. ej. inverso de la varianza dentro del parche). Por defecto 1. */
	weight?: number;
	/** Centro del parche en la hoja, en mm desde la esquina superior izquierda (para campo plano). */
	positionMm?: readonly [number, number];
}

export type FitMethod = 'smooth' | 'pchip' | 'linear';

export const FIT_METHODS: readonly FitMethod[] = ['smooth', 'pchip', 'linear'];

/** Punto agregado: todas las repeticiones de un mismo `value`. */
export interface AggregatedPoint {
	value: number;
	lightness: number;
	weight: number;
	replicates: number;
	/** Desviacion estandar entre repeticiones (0 si hay una sola). */
	spread: number;
}

export interface ResponseModel {
	method: FitMethod;
	/** L* estimado para un valor de negativo (monotono decreciente). */
	evaluate: (value: number) => number;
	/** Rango de valores cubierto por las mediciones. */
	domain: readonly [number, number];
	/** RMSE de ajuste en ΔL* sobre los puntos agregados. */
	fitRmse: number;
	/** RMSE de validacion cruzada leave-one-out en ΔL* (null si no se pudo calcular). */
	looRmse: number | null;
}

export type Severity = 'info' | 'warning' | 'error';

/** Diagnostico con codigo estable; la UI lo traduce (es/en) con sus parametros. */
export interface Diagnostic {
	code: DiagnosticCode;
	severity: Severity;
	params?: Record<string, number | string>;
}

export type DiagnosticCode =
	| 'TOO_FEW_VALUES'
	| 'NOT_DECREASING'
	| 'LOW_RANGE'
	| 'WHITE_PLATEAU'
	| 'BLACK_PLATEAU'
	| 'NON_MONOTONIC_MEASUREMENTS'
	| 'SPARSE_REGION'
	| 'HIGH_REPLICATE_SPREAD'
	| 'POOR_FIT';

export class CalibrationError extends Error {
	constructor(
		readonly code: DiagnosticCode,
		readonly params: Record<string, number | string> = {}
	) {
		super(`${code} ${JSON.stringify(params)}`);
		this.name = 'CalibrationError';
	}
}
