/** Ejecuta el calculo de curvas en un Web Worker y entrega el resultado como promesa. */
import type { MeasuredPatch } from '../core/curve/types';
import type { CurveComputation, CurveFailure } from './compute';
import CurveWorker from './curve.worker?worker';

export interface CurveRun {
	promise: Promise<CurveComputation | CurveFailure>;
	cancel: () => void;
}

export function runCurve(patches: MeasuredPatch[]): CurveRun {
	const worker = new CurveWorker();
	const promise = new Promise<CurveComputation | CurveFailure>((resolve) => {
		worker.onmessage = (event: MessageEvent<CurveComputation | CurveFailure>) => {
			worker.terminate();
			resolve(event.data);
		};
		worker.postMessage(patches);
	});
	return { promise, cancel: () => worker.terminate() };
}

type ScannedRound = { scan?: { patches: MeasuredPatch[]; diagnostics: { severity: string }[] } };

/** Impresiones (1..n) cuyo escaneo tiene un diagnostico de error: no se usan para la curva. */
export function invalidPrints(rounds: readonly ScannedRound[]): number[] {
	return rounds.flatMap((round, i) =>
		round.scan?.diagnostics.some((d) => d.severity === 'error') ? [i + 1] : []
	);
}

/**
 * Parches de las impresiones escaneadas que entran a la curva: las que el usuario no excluyo y
 * cuyo escaneo no tiene errores (un escaneo equivocado nunca debe producir una curva).
 */
export function includedPatches(
	rounds: readonly ScannedRound[],
	excludedPrints: readonly number[] = []
): MeasuredPatch[] {
	const invalid = invalidPrints(rounds);
	return rounds.flatMap((round, i) =>
		round.scan && !excludedPrints.includes(i + 1) && !invalid.includes(i + 1) ? round.scan.patches : []
	);
}
