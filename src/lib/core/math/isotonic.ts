/**
 * Regresion isotonica ponderada (Pool Adjacent Violators).
 *
 * Devuelve la secuencia monotona mas cercana (minimos cuadrados ponderados) a `values`,
 * manteniendo el orden de entrada. Es la base para eliminar el ruido no monotono de las
 * mediciones antes de interpolar: la respuesta fisica papel/negativo es monotona.
 */
export function isotonic(
	values: readonly number[],
	weights: readonly number[] = values.map(() => 1),
	direction: 'increasing' | 'decreasing' = 'increasing'
): number[] {
	if (values.length !== weights.length) {
		throw new Error('isotonic: values y weights deben tener el mismo largo');
	}
	const sign = direction === 'increasing' ? 1 : -1;
	const blockValue: number[] = [];
	const blockWeight: number[] = [];
	const blockSize: number[] = [];

	for (let i = 0; i < values.length; i++) {
		const w = weights[i]!;
		if (!(w > 0)) throw new Error('isotonic: los pesos deben ser positivos');
		blockValue.push(sign * values[i]!);
		blockWeight.push(w);
		blockSize.push(1);
		while (blockValue.length > 1 && blockValue.at(-2)! > blockValue.at(-1)!) {
			const v2 = blockValue.pop()!;
			const w2 = blockWeight.pop()!;
			const s2 = blockSize.pop()!;
			const last = blockValue.length - 1;
			const w1 = blockWeight[last]!;
			blockValue[last] = (blockValue[last]! * w1 + v2 * w2) / (w1 + w2);
			blockWeight[last] = w1 + w2;
			blockSize[last] = blockSize[last]! + s2;
		}
	}

	const out: number[] = [];
	for (let b = 0; b < blockValue.length; b++) {
		for (let k = 0; k < blockSize[b]!; k++) out.push(sign * blockValue[b]!);
	}
	return out;
}
