<script lang="ts">
	import { Download, ImageUp } from '@lucide/svelte';
	import type { FitMethod } from '$lib/core/curve/types';
	import type { CurveComputation } from '$lib/curve/compute';
	import { includedPatches, runCurve } from '$lib/curve/run';
	import { i18n, type MessageKey } from '$lib/i18n/index.svelte';
	import type { PhotoFailure } from '$lib/photo/pipeline';
	import PhotoWorker from '$lib/photo/photo.worker?worker';
	import type { Project } from '$lib/project/types';
	import Button from '$lib/ui/Button.svelte';
	import Notice from '$lib/ui/Notice.svelte';
	import Segmented from '$lib/ui/Segmented.svelte';
	import { downloadBytes } from '$lib/ui/download';

	interface Props {
		project: Project;
		curveHref: string;
	}

	interface PhotoResult {
		file: Uint8Array;
		fileName: string;
		width: number;
		height: number;
		dpi: number;
		positive: string;
		negative: string;
	}

	let { project, curveHref }: Props = $props();

	let curve = $state<CurveComputation | null>(null);
	let photo = $state<File | null>(null);
	let result = $state<PhotoResult | null>(null);
	let failure = $state<PhotoFailure | null>(null);
	let busy = $state(false);
	let dragging = $state(false);
	let mirror = $state(true);
	let dpi = $state<number | 'original'>('original');
	let format = $state<'png' | 'tiff'>('tiff');
	let input: HTMLInputElement | undefined = $state();

	const patches = $derived(includedPatches(project.rounds, project.curve?.excludedPrints));

	$effect(() => {
		const data = $state.snapshot(patches);
		if (data.length === 0) {
			curve = null;
			return;
		}
		const run = runCurve(data);
		void run.promise.then((outcome) => (curve = outcome.ok ? outcome : null));
		return () => run.cancel();
	});

	const method = $derived<FitMethod | null>(
		curve
			? (curve.candidates.find((c) => c.method === project.curve?.method && c.curve)?.method ??
					curve.recommended)
			: null
	);
	const negativeSamples = $derived(
		curve?.candidates.find((c) => c.method === method)?.curve?.negative ?? null
	);

	// Genera (o regenera) el negativo cuando cambian la foto, la curva o las opciones.
	$effect(() => {
		const file = photo;
		const samples = negativeSamples ? $state.snapshot(negativeSamples) : null;
		const options = { mirror, dpi: dpi === 'original' ? null : dpi, format };
		if (!file || !samples) return;
		busy = true;
		failure = null;
		const worker = new PhotoWorker();
		let alive = true;
		const stop = (code: string) => {
			worker.terminate();
			if (!alive) return;
			failure = { ok: false, code, params: {} };
			busy = false;
		};
		worker.onerror = () => stop('WORKER_CRASHED');
		worker.onmessageerror = () => stop('WORKER_CRASHED');
		worker.onmessage = (event: MessageEvent<({ ok: true } & PhotoResult) | PhotoFailure>) => {
			worker.terminate();
			if (!alive) return;
			busy = false;
			if (event.data.ok) result = event.data;
			else failure = event.data;
		};
		void file.arrayBuffer().then((bytes) => {
			if (alive) worker.postMessage({ bytes, fileName: file.name, negative: samples, ...options }, [bytes]);
		});
		return () => {
			alive = false;
			worker.terminate();
		};
	});

	function choose(files: FileList | null | undefined) {
		const file = files?.[0];
		if (!file) return;
		result = null;
		photo = file;
	}

	function errorText(code: string): string {
		const fileCodes = [
			'CORRUPT_FILE',
			'UNSUPPORTED_FORMAT',
			'UNSUPPORTED_BIT_DEPTH',
			'UNSUPPORTED_LAYOUT',
			'WORKER_CRASHED'
		];
		return fileCodes.includes(code)
			? i18n.t(`scan.error.${code}` as MessageKey)
			: i18n.t('photo.error.UNKNOWN');
	}

	const cm = (pixels: number, perInch: number) =>
		new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 1 }).format((pixels / perInch) * 2.54);
</script>

{#snippet downloadIcon()}<Download size={18} aria-hidden="true" />{/snippet}
{#snippet photoIcon()}<ImageUp size={18} aria-hidden="true" />{/snippet}

<section class="step" aria-labelledby="photo-title">
	<header>
		<h1 id="photo-title">{i18n.t('photo.title')}</h1>
		<p class="lead">{i18n.t('photo.lead')}</p>
	</header>

	{#if patches.length === 0}
		<Notice tone="info" title={i18n.t('export.none.title')}><p>{i18n.t('export.none.body')}</p></Notice>
		<Button variant="primary" href={curveHref}>{i18n.t('export.none.action')}</Button>
	{:else}
		<input
			bind:this={input}
			class="visually-hidden"
			type="file"
			accept=".tif,.tiff,.png,.jpg,.jpeg,image/tiff,image/png,image/jpeg"
			tabindex="-1"
			onchange={(event) => choose(event.currentTarget.files)}
		/>

		{#if !photo}
			<div
				class="drop"
				class:dragging
				role="group"
				aria-labelledby="photo-drop-title"
				ondragover={(event) => {
					event.preventDefault();
					dragging = true;
				}}
				ondragleave={() => (dragging = false)}
				ondrop={(event) => {
					event.preventDefault();
					dragging = false;
					choose(event.dataTransfer?.files);
				}}
			>
				<ImageUp size={32} aria-hidden="true" />
				<p id="photo-drop-title" class="drop-title">{i18n.t('photo.drop.title')}</p>
				<p class="hint">{i18n.t('scan.drop.or')}</p>
				<Button variant="primary" onclick={() => input?.click()}>{i18n.t('photo.drop.choose')}</Button>
				<p class="hint formats">{i18n.t('photo.drop.formats')}</p>
			</div>
		{:else}
			<div class="layout">
				<div class="pair" class:stale={busy && Boolean(result)}>
					{#if result}
						<figure>
							<img src={result.positive} alt={i18n.t('photo.positive')} />
							<figcaption>{i18n.t('photo.positive')}</figcaption>
						</figure>
						<figure>
							<img src={result.negative} alt={i18n.t('photo.negative')} />
							<figcaption>{i18n.t('photo.negative')}</figcaption>
						</figure>
					{:else if busy}
						<p class="processing" role="status">{i18n.t('photo.processing')}</p>
					{/if}
				</div>

				<div class="side">
					{#if method}
						<p class="hint">
							{i18n.t('photo.method', { method: i18n.t(`curve.method.${method}` as MessageKey) })}
						</p>
					{/if}
					<label class="check">
						<input type="checkbox" bind:checked={mirror} />
						<span>
							{i18n.t('photo.mirror')}
							<span class="hint">{i18n.t('photo.mirror.hint')}</span>
						</span>
					</label>
					<Segmented
						name="photo-dpi"
						legend={i18n.t('photo.dpi')}
						options={[
							{ value: 'original' as const, label: i18n.t('photo.dpi.original') },
							{ value: 300 as const, label: '300' },
							{ value: 360 as const, label: '360' },
							{ value: 720 as const, label: '720' }
						]}
						bind:value={dpi}
					/>
					<Segmented
						name="photo-format"
						legend={i18n.t('photo.format')}
						options={[
							{ value: 'tiff' as const, label: 'TIFF 16 bits' },
							{ value: 'png' as const, label: 'PNG 16 bits' }
						]}
						bind:value={format}
					/>

					{#if result}
						<p class="size">
							{i18n.t('photo.size', {
								width: result.width,
								height: result.height,
								dpi: result.dpi,
								widthCm: cm(result.width, result.dpi),
								heightCm: cm(result.height, result.dpi)
							})}
						</p>
					{/if}

					{#if busy && result}
						<p class="hint" role="status">{i18n.t('photo.processing')}</p>
					{/if}

					{#if failure}
						<Notice tone="error" title={i18n.t('photo.error.title')}><p>{errorText(failure.code)}</p></Notice>
					{/if}

					<div class="actions">
						<Button
							variant="primary"
							icon={downloadIcon}
							disabled={!result || busy}
							onclick={() =>
								result &&
								downloadBytes(result.file, result.fileName, format === 'tiff' ? 'image/tiff' : 'image/png')}
						>
							{i18n.t('photo.download')}
						</Button>
						<Button variant="secondary" icon={photoIcon} onclick={() => input?.click()}
							>{i18n.t('photo.change')}</Button
						>
					</div>
				</div>
			</div>
		{/if}
	{/if}
</section>

<style>
	.step {
		display: grid;
		gap: var(--space-6);
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

	.drop {
		display: grid;
		justify-items: center;
		gap: var(--space-2);
		padding: var(--space-12) var(--space-6);
		border: var(--border-width) dashed var(--border-control);
		border-radius: var(--radius-lg);
		background: var(--surface-sunken);
		color: var(--text-secondary);
		text-align: center;
		transition:
			border-color var(--duration-fast) var(--ease-standard),
			background-color var(--duration-fast) var(--ease-standard);
	}

	.drop.dragging {
		border-color: var(--action-primary);
		background: var(--surface-raised);
	}

	.drop-title {
		margin: 0;
		color: var(--text-primary);
		font-size: var(--text-xl);
		font-weight: var(--weight-semibold);
	}

	.formats {
		max-width: 48ch;
		margin-block-start: var(--space-2);
	}

	.layout {
		display: grid;
		gap: var(--space-8);
		align-items: start;
	}

	/* Positivo y negativo lado a lado sobre el lienzo neutro: lo que manda en la pantalla. */
	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-3);
		min-height: 12rem;
		padding: var(--space-4);
		border-radius: var(--radius-lg);
		background: var(--surface-canvas);
		transition: opacity var(--duration-base) var(--ease-standard);
	}

	.pair.stale {
		opacity: 0.55;
	}

	figure {
		display: grid;
		gap: var(--space-2);
		align-content: start;
		margin: 0;
	}

	img {
		display: block;
		width: 100%;
		height: auto;
		max-height: 60vh;
		object-fit: contain;
		box-shadow: 0 0 0 var(--border-width) var(--border-subtle);
	}

	figcaption,
	.size {
		color: var(--text-secondary);
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
	}

	.size {
		margin: 0;
	}

	.processing {
		grid-column: 1 / -1;
		align-self: center;
		margin: 0;
		color: var(--text-secondary);
		text-align: center;
	}

	.side {
		display: grid;
		gap: var(--space-4);
		justify-items: start;
	}

	.check {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--space-3);
		align-items: start;
		cursor: pointer;
	}

	.check input {
		width: var(--space-4);
		height: var(--space-4);
		margin-block-start: var(--space-1);
		accent-color: var(--action-primary);
	}

	.check .hint {
		display: block;
	}

	.hint {
		margin: 0;
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	@media (min-width: 64rem) {
		.layout {
			grid-template-columns: minmax(0, 3fr) minmax(18rem, 2fr);
		}
	}
</style>
