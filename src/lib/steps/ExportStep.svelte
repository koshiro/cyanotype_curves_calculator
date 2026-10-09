<script lang="ts">
	import { Check, Download, FileOutput, TriangleAlert } from '@lucide/svelte';
	import type { FitMethod } from '$lib/core/curve/types';
	import { encodeAcvWithReport, encodeAmp, encodeCube, encodeGimpCurves } from '$lib/core/export/formats';
	import type { CurveComputation, CurveFailure } from '$lib/curve/compute';
	import { includedPatches, runCurve } from '$lib/curve/run';
	import { i18n, type MessageKey } from '$lib/i18n/index.svelte';
	import { exportProject } from '$lib/project/transfer';
	import type { Project } from '$lib/project/types';
	import Button from '$lib/ui/Button.svelte';
	import Notice from '$lib/ui/Notice.svelte';
	import { downloadBytes, slug } from '$lib/ui/download';

	interface Props {
		project: Project;
		curveHref: string;
	}

	let { project, curveHref }: Props = $props();
	let result = $state<CurveComputation | null>(null);
	let failure = $state<CurveFailure | null>(null);
	let computing = $state(false);

	const patches = $derived(includedPatches(project.rounds, project.curve?.excludedPrints));

	$effect(() => {
		const input = $state.snapshot(patches);
		if (input.length === 0) {
			result = null;
			return;
		}
		computing = true;
		const run = runCurve(input);
		void run.promise.then((outcome) => {
			computing = false;
			result = outcome.ok ? outcome : null;
			failure = outcome.ok ? null : outcome;
		});
		return () => run.cancel();
	});

	const method = $derived<FitMethod | null>(
		result
			? (result.candidates.find((c) => c.method === project.curve?.method && c.curve)?.method ??
					result.recommended)
			: null
	);
	const samples = $derived(result?.candidates.find((c) => c.method === method)?.curve?.samples ?? null);
	const acv = $derived(samples ? encodeAcvWithReport(samples) : null);
	const base = $derived(`cyano-curva-${slug(project.name)}-${method ?? 'curva'}`);
	/** Hay avisos de severidad advertencia o error en las mediciones o en el modelo elegido. */
	const hasProblems = $derived.by(() => {
		if (!result) return false;
		const chosen = result.candidates.find((c) => c.method === method);
		return [...result.data.diagnostics, ...(chosen?.report.diagnostics ?? [])].some(
			(d) => d.severity === 'warning' || d.severity === 'error'
		);
	});
	const methodName = $derived(method ? i18n.t(`curve.method.${method}` as MessageKey) : '');

	interface ExportFile {
		id: string;
		title: string;
		body: string;
		file: string;
		recommended?: boolean;
		warning?: string;
		make: () => { bytes: Uint8Array | string; type: string };
	}

	const files = $derived.by((): ExportFile[] => {
		if (!samples || !acv) return [];
		const negative = samples.map((v) => 255 - v);
		const maxError = Math.ceil(acv.fidelity.maxError * 10) / 10;
		return [
			{
				id: 'amp',
				title: i18n.t('export.amp.title'),
				body: i18n.t('export.amp.body'),
				file: `${base}.amp`,
				recommended: true,
				make: () => ({ bytes: encodeAmp(samples), type: 'application/octet-stream' })
			},
			{
				id: 'acv',
				title: i18n.t('export.acv.title'),
				body: i18n.t('export.acv.body', { points: acv.fidelity.anchors.length }),
				file: `${base}.acv`,
				warning: acv.fidelity.faithful ? undefined : i18n.t('export.acv.warning', { error: maxError }),
				make: () => ({ bytes: acv.bytes, type: 'application/octet-stream' })
			},
			{
				id: 'gimp',
				title: i18n.t('export.gimp.title'),
				body: i18n.t('export.gimp.body'),
				file: `${base}.settings`,
				make: () => ({ bytes: encodeGimpCurves(samples), type: 'text/plain' })
			},
			{
				id: 'cube',
				title: i18n.t('export.cube.title'),
				body: i18n.t('export.cube.body'),
				file: `${base}.cube`,
				make: () => ({ bytes: encodeCube(samples, `Cyano Curve ${project.name}`), type: 'text/plain' })
			},
			{
				id: 'negative',
				title: i18n.t('export.negative.title'),
				body: i18n.t('export.negative.body'),
				file: `${base}-negativo.cube`,
				make: () => ({
					bytes: encodeCube(negative, `Cyano Curve ${project.name} (negativo)`),
					type: 'text/plain'
				})
			}
		];
	});

	const failureKey = (code: string) =>
		(['TOO_FEW_VALUES', 'NOT_DECREASING', 'INVALID_MEASUREMENT', 'LOW_RANGE'].includes(code)
			? `curve.error.${code}`
			: 'curve.error.UNKNOWN') as MessageKey;

	function download(file: ExportFile) {
		const { bytes, type } = file.make();
		downloadBytes(bytes, file.file, type);
	}

	function downloadProject() {
		downloadBytes(
			exportProject($state.snapshot(project)),
			`cyano-proyecto-${slug(project.name)}.json`,
			'application/json'
		);
	}
</script>

{#snippet downloadIcon()}<Download size={18} aria-hidden="true" />{/snippet}
{#snippet fileRow(file: ExportFile, lead: boolean)}
	<div class="file" class:lead-file={lead}>
		<div class="file-text">
			<p class="file-title">
				{file.title}
				{#if lead}
					<span class="badge"><Check size={14} aria-hidden="true" /> {i18n.t('export.recommended')}</span>
				{/if}
			</p>
			<p class="file-body">{file.body}</p>
			{#if file.warning}
				<p class="file-warning"><TriangleAlert size={16} aria-hidden="true" /> {file.warning}</p>
			{/if}
		</div>
		<Button
			variant={lead ? 'primary' : 'secondary'}
			icon={downloadIcon}
			aria-label={i18n.t('export.download.file', { file: file.file })}
			onclick={() => download(file)}
		>
			{i18n.t('export.download')}
		</Button>
	</div>
{/snippet}
{#snippet projectIcon()}<FileOutput size={18} aria-hidden="true" />{/snippet}

<section class="step" aria-labelledby="export-title">
	<header>
		<h1 id="export-title">{i18n.t('export.title')}</h1>
		<p class="lead">{i18n.t('export.lead')}</p>
	</header>

	{#if patches.length === 0}
		<Notice tone="info" title={i18n.t('export.none.title')}><p>{i18n.t('export.none.body')}</p></Notice>
		<Button variant="primary" href={curveHref}>{i18n.t('export.none.action')}</Button>
	{:else if failure}
		<Notice tone="error" title={i18n.t('export.failed')}>
			<p>{i18n.t(failureKey(failure.code), failure.params)}</p>
		</Notice>
		<Button variant="primary" href={curveHref}>{i18n.t('export.none.action')}</Button>
	{:else if computing && !result}
		<p class="hint" role="status">{i18n.t('curve.computing')}</p>
	{:else if files.length > 0}
		<p class="method">{i18n.t('export.method', { method: methodName })}</p>
		{#if hasProblems}
			<Notice tone="warning">
				<p>{i18n.t('export.problems')}</p>
			</Notice>
		{/if}

		<section aria-labelledby="files-title" class="files-section">
			<h2 id="files-title" class="visually-hidden">{i18n.t('export.files')}</h2>
			{#each files.filter((f) => f.recommended) as file (file.id)}
				{@render fileRow(file, true)}
			{/each}
			<ul class="files">
				{#each files.filter((f) => !f.recommended) as file (file.id)}
					<li>{@render fileRow(file, false)}</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section class="project" aria-labelledby="project-export-title">
		<h2 id="project-export-title">{i18n.t('export.project.title')}</h2>
		<p>{i18n.t('export.project.body')}</p>
		<Button variant="secondary" icon={projectIcon} onclick={downloadProject}
			>{i18n.t('export.project.download')}</Button
		>
	</section>
</section>

<style>
	.step {
		display: grid;
		gap: var(--space-6);
		max-width: 52rem;
	}

	h1 {
		margin: 0 0 var(--space-2);
		font-size: var(--screen-title);
	}

	.lead {
		max-width: 60ch;
		margin: 0;
		color: var(--text-secondary);
	}

	.method,
	.hint {
		margin: 0;
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	.files {
		display: grid;
		margin: 0;
		padding: 0;
		border-block-start: var(--border-width) solid var(--border-subtle);
		list-style: none;
	}

	.file {
		display: grid;
		gap: var(--space-3);
		align-items: center;
		padding: var(--space-4) 0;
		border-block-end: var(--border-width) solid var(--border-subtle);
	}

	.files-section {
		display: grid;
		gap: var(--space-4);
	}

	/*
	 * El formato exacto lidera como bloque propio sobre la lista (superficie y radio mayor, no
	 * un borde lateral). El resto de la lista usa el mismo eje izquierdo que el texto del bloque.
	 */
	.lead-file {
		padding: var(--space-4);
		border: var(--border-width) solid var(--border-subtle);
		border-radius: var(--radius-lg);
		background: var(--surface-raised);
	}

	.files .file {
		padding-inline: var(--space-4);
	}

	.file-text {
		display: grid;
		gap: var(--space-1);
	}

	.file-title {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		font-weight: var(--weight-semibold);
	}

	.lead-file .file-title {
		font-size: var(--text-lg);
	}

	.badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--feedback-success);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
	}

	.file-body {
		margin: 0;
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	.file-warning {
		display: flex;
		gap: var(--space-2);
		align-items: flex-start;
		margin: 0;
		color: var(--feedback-warning);
		font-size: var(--text-sm);
	}

	.project {
		display: grid;
		gap: var(--space-2);
		justify-items: start;
		padding-block-start: var(--space-6);
	}

	.project h2 {
		margin: 0;
		font-size: var(--text-xl);
	}

	.project p {
		max-width: 60ch;
		margin: 0;
		color: var(--text-secondary);
	}

	@media (min-width: 40rem) {
		.file {
			grid-template-columns: 1fr auto;
			gap: var(--space-6);
		}
	}
</style>
