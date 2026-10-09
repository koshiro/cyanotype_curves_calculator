import type { MessageKey } from '$lib/i18n/index.svelte';

export type StepId = 'project' | 'target' | 'scan' | 'curve' | 'export';

export interface StepInfo {
	id: StepId;
	label: MessageKey;
	/** Implementado en esta version de la interfaz. */
	ready: boolean;
}

export const STEPS: readonly StepInfo[] = [
	{ id: 'project', label: 'steps.project', ready: true },
	{ id: 'target', label: 'steps.target', ready: true },
	{ id: 'scan', label: 'steps.scan', ready: true },
	{ id: 'curve', label: 'steps.curve', ready: true },
	{ id: 'export', label: 'steps.export', ready: true }
];

export function isStepId(value: string | null): value is StepId {
	return STEPS.some((s) => s.id === value);
}
