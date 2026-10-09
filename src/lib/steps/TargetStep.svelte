<script lang="ts">
	import { Download, Printer } from '@lucide/svelte';
	import type { PaperName, TargetOptions } from '$lib/core/target/layout';
	import { renderTarget } from '$lib/core/target/render';
	import { i18n } from '$lib/i18n/index.svelte';
	import { encodeGrayPng } from '$lib/io/png';
	import { newId, type Project } from '$lib/project/types';
	import Button from '$lib/ui/Button.svelte';
	import Notice from '$lib/ui/Notice.svelte';
	import Segmented from '$lib/ui/Segmented.svelte';
	import TextField from '$lib/ui/TextField.svelte';
	import { downloadBytes, slug } from '$lib/ui/download';
	import {
		DEFAULT_TARGET,
		DPI_CHOICES,
		largestFittingPatch,
		minimumSheet,
		PATCH_SIZES_MM,
		sameTarget,
		STEP_CHOICES,
		tryLayout
	} from './target-options';

	interface Props {
		project: Project;
		onsave: () => Promise<void>;
	}

	let { project = $bindable(), onsave }: Props = $props();

	let options = $state<TargetOptions>({ ...DEFAULT_TARGET, seed: Math.floor(Math.random() * 0xffff) });
	let customWidth = $state(200);
	let customHeight = $state(250);
	let busy = $state(false);
	/** Aviso del ajuste automatico del parche (se borra al tocar el parche a mano). */
	let adjusted = $state<{ size: number; steps: number } | null>(null);
	let downloaded = $state<{ print: number; newPrint: boolean } | null>(null);
	let canvas: HTMLCanvasElement | undefined = $state();

	// Al abrir el paso se retoman las opciones de la ultima impresion, si existe.
	$effect.pre(() => {
		const saved = project.rounds.at(-1)?.targetOptions;
		if (saved) {
			options = { ...saved };
			if (saved.customSizeMm) [customWidth, customHeight] = saved.customSizeMm;
		}
	});

	const effective = $derived<TargetOptions>(
		options.paper === 'custom'
			? { ...options, customSizeMm: [Number(customWidth), Number(customHeight)] }
			: options
	);
	const result = $derived(tryLayout(effective));
	const references = $derived(
		result.layout ? result.layout.patches.filter((p) => p.role === 'reference').length : 0
	);
	const errorText = $derived.by(() => {
		const error = result.error;
		if (!error) return null;
		if (error.code === 'SHEET_TOO_SMALL') {
			const [minWidth, minHeight] = minimumSheet(effective) ?? [120, 150];
			return i18n.t('target.error.SHEET_TOO_SMALL', { minWidth, minHeight });
		}
		return i18n.t(`target.error.${error.code}`, error.params);
	});

	function changed(next: TargetOptions) {
		options = next;
		downloaded = null;
	}

	/** Ajusta el parche solo si el actual no cabe: nunca cambia una eleccion que sigue siendo valida. */
	function fitPatch(next: TargetOptions): TargetOptions {
		const size = options.patchSizeMm ?? 12;
		const candidate =
			options.paper === 'custom' && next.paper === 'custom'
				? { ...next, customSizeMm: effective.customSizeMm }
				: next;
		if (tryLayout({ ...candidate, patchSizeMm: size }).layout) {
			adjusted = null;
			return { ...next, patchSizeMm: size };
		}
		const fits = largestFittingPatch(candidate);
		adjusted = fits !== null ? { size: fits, steps: next.steps ?? 51 } : null;
		return { ...next, patchSizeMm: fits ?? size };
	}

	function chooseSteps(steps: number) {
		changed(fitPatch({ ...options, steps }));
	}

	function choosePaper(paper: PaperName) {
		changed(fitPatch({ ...options, paper }));
	}

	$effect(() => {
		const layout = result.layout;
		if (!canvas || !layout) return;
		const pixels = renderTarget(layout);
		canvas.width = layout.width;
		canvas.height = layout.height;
		const context = canvas.getContext('2d');
		if (!context) return;
		const image = context.createImageData(layout.width, layout.height);
		for (let i = 0; i < pixels.length; i++) {
			const v = pixels[i]!;
			image.data[i * 4] = v;
			image.data[i * 4 + 1] = v;
			image.data[i * 4 + 2] = v;
			image.data[i * 4 + 3] = 255;
		}
		context.putImageData(image, 0, 0);
	});

	async function download() {
		const layout = result.layout;
		if (!layout) return;
		busy = true;
		try {
			// Misma impresion mientras no tenga escaneo; si ya se escaneo, un cambio abre otra.
			const last = project.rounds.at(-1);
			const targetOptions = $state.snapshot(effective);
			let newPrint = false;
			if (last && !last.scan) {
				last.targetOptions = targetOptions;
				last.layout = layout;
			} else if (!last || !sameTarget(last.targetOptions, targetOptions)) {
				project.rounds.push({ id: newId(), createdAt: new Date().toISOString(), targetOptions, layout });
				newPrint = Boolean(last);
			}
			await onsave();
			const print = project.rounds.length;
			const png = encodeGrayPng(renderTarget(layout), layout.width, layout.height, layout.dpi);
			downloadBytes(png, `cyano-negativo-${slug(project.name)}-impresion-${print}.png`, 'image/png');
			downloaded = { print, newPrint };
		} finally {
			busy = false;
		}
	}
</script>

{#snippet downloadIcon()}<Download size={18} aria-hidden="true" />{/snippet}

<section class="step" aria-labelledby="target-title">
	<header>
		<h1 id="target-title">{i18n.t('target.title')}</h1>
		<p class="lead">{i18n.t('target.lead')}</p>
	</header>

	<div class="layout">
		<figure class="preview" aria-label={i18n.t('target.preview')}>
			{#if result.layout}
				<canvas
					bind:this={canvas}
					aria-hidden="true"
					style:--ratio={result.layout.width / result.layout.height}
				></canvas>
				<figcaption>
					{i18n.t('target.summary', {
						steps: options.steps ?? 0,
						references,
						paper: i18n.t(`target.paper.${options.paper ?? 'letter'}` as 'target.paper.letter'),
						width: result.layout.width,
						height: result.layout.height
					})}
				</figcaption>
			{:else}
				<p class="unavailable">{i18n.t('target.preview.unavailable')}</p>
			{/if}
		</figure>

		<div class="controls">
			<Segmented
				name="paper"
				legend={i18n.t('target.paper')}
				options={[
					{ value: 'letter' as PaperName, label: i18n.t('target.paper.letter') },
					{ value: 'a4' as PaperName, label: i18n.t('target.paper.a4') },
					{ value: 'custom' as PaperName, label: i18n.t('target.paper.custom') }
				]}
				value={options.paper ?? 'letter'}
				onchange={choosePaper}
			/>
			{#if options.paper === 'custom'}
				<div class="pair">
					<TextField
						id="custom-width"
						type="number"
						min={60}
						max={600}
						label={i18n.t('target.width')}
						bind:value={customWidth}
						oninput={() => (downloaded = null)}
					/>
					<TextField
						id="custom-height"
						type="number"
						min={60}
						max={600}
						label={i18n.t('target.height')}
						bind:value={customHeight}
						oninput={() => (downloaded = null)}
					/>
				</div>
			{/if}

			<div class="group">
				<Segmented
					name="steps"
					legend={i18n.t('target.steps')}
					options={STEP_CHOICES.map((value) => ({ value, label: String(value) }))}
					value={options.steps ?? 51}
					onchange={chooseSteps}
				/>
				<p class="hint">{i18n.t('target.steps.hint')}</p>
			</div>

			<div class="group">
				<Segmented
					name="patch"
					legend={i18n.t('target.patch')}
					options={[...PATCH_SIZES_MM]
						.sort((a, b) => a - b)
						.map((value) => ({ value, label: String(value) }))}
					value={options.patchSizeMm ?? 12}
					onchange={(value) => {
						adjusted = null;
						changed({ ...options, patchSizeMm: value });
					}}
				/>
				{#if adjusted}
					<p class="hint" aria-live="polite">{i18n.t('target.patch.adjusted', adjusted)}</p>
				{/if}
			</div>

			<Segmented
				name="dpi"
				legend={i18n.t('target.dpi')}
				options={DPI_CHOICES.map((value) => ({ value, label: String(value) }))}
				value={options.dpi ?? 300}
				onchange={(value) => changed({ ...options, dpi: value })}
			/>

			{#if errorText}
				<Notice tone="error">{errorText}</Notice>
			{/if}

			<Button
				variant="primary"
				icon={downloadIcon}
				loading={busy}
				disabled={!result.layout}
				onclick={download}
			>
				{i18n.t('target.download')}
			</Button>

			{#if downloaded}
				<Notice tone="success" title={i18n.t('target.downloaded', { print: downloaded.print })}>
					{#if downloaded.newPrint}<p>{i18n.t('target.downloaded.new', { print: downloaded.print })}</p>{/if}
					<p>{i18n.t('target.downloaded.next')}</p>
				</Notice>
			{/if}

			<div class="print">
				<h2><Printer size={18} aria-hidden="true" /> {i18n.t('target.print.title')}</h2>
				<ul>
					<li>{i18n.t('target.print.scale')}</li>
					<li>{i18n.t('target.print.color')}</li>
					<li>{i18n.t('target.print.same')}</li>
					<li>{i18n.t('target.print.keep')}</li>
				</ul>
			</div>
		</div>
	</div>
</section>

<style>
	.step {
		display: grid;
		gap: var(--space-8);
	}

	h1 {
		margin: 0 0 var(--space-2);
		font-size: var(--screen-title);
	}

	.lead {
		max-width: 56ch;
		margin: 0;
		color: var(--text-secondary);
	}

	.layout {
		display: grid;
		gap: var(--space-8);
		align-items: start;
	}

	.preview {
		display: grid;
		justify-items: center;
		gap: var(--space-3);
		margin: 0;
		padding: var(--space-4);
		border-radius: var(--radius-lg);
		background: var(--surface-canvas);
	}

	/*
	 * El marco abraza la hoja: el ancho es el menor entre el disponible y el que corresponde al
	 * alto maximo segun la proporcion; el alto sale de la proporcion. Nunca se deforma.
	 */
	canvas {
		--preview-height: 40vh;
		display: block;
		width: min(100%, calc(var(--preview-height) * var(--ratio)));
		height: auto;
		aspect-ratio: var(--ratio);
		box-shadow: 0 0 0 var(--border-width) var(--border-subtle);
	}

	figcaption {
		justify-self: start;
		color: var(--text-secondary);
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
	}

	.unavailable {
		display: grid;
		place-items: center;
		width: 100%;
		min-height: 30vh;
		margin: 0;
		border: var(--border-width) dashed var(--border-control);
		border-radius: var(--radius-md);
		color: var(--text-secondary);
		text-align: center;
		padding: var(--space-6);
	}

	.controls {
		display: grid;
		gap: var(--space-6);
		justify-items: start;
	}

	.group {
		display: grid;
		gap: var(--space-1);
	}

	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-3);
		width: 100%;
		max-width: 20rem;
	}

	.hint {
		margin: 0;
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	.print {
		padding: var(--space-4);
		border: var(--border-width) solid var(--border-subtle);
		border-radius: var(--radius-md);
	}

	.print h2 {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0 0 var(--space-2);
		font-size: var(--text-base);
	}

	.print ul {
		margin: 0;
		padding-inline-start: var(--space-4);
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	.print li + li {
		margin-block-start: var(--space-1);
	}

	@media (min-width: 64rem) {
		.layout {
			grid-template-columns: minmax(0, 3fr) minmax(18rem, 2fr);
		}

		/* En escritorio la vista previa acompana a los controles mientras se desplazan. */
		.preview {
			position: sticky;
			inset-block-start: var(--space-6);
		}

		canvas {
			--preview-height: 72vh;
		}
	}
</style>
