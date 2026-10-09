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

/** Parches de las impresiones escaneadas que el usuario incluyo en la curva. */
export function includedPatches(
	rounds: readonly { scan?: { patches: MeasuredPatch[] } }[],
	excludedPrints: readonly number[] = []
): MeasuredPatch[] {
	return rounds.flatMap((round, i) =>
		round.scan && !excludedPrints.includes(i + 1) ? round.scan.patches : []
	);
}
