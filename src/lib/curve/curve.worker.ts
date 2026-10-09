/// <reference lib="webworker" />
/** Web Worker del calculo de curvas (la validacion cruzada con 256 pasos toma ~0,5 s). */
import type { MeasuredPatch } from '../core/curve/types';
import { computeCurve } from './compute';

self.onmessage = (event: MessageEvent<MeasuredPatch[]>) => {
	self.postMessage(computeCurve(event.data));
};
