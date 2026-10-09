<script lang="ts">
	import { Maximize2, ScanLine, Upload } from '@lucide/svelte';
	import { i18n, type MessageKey } from '$lib/i18n/index.svelte';
	import type { Project, Round, ScanRecord } from '$lib/project/types';
	import type { ScanOutcome, ScanSuccess } from '$lib/scan/pipeline';
	import ScanWorker from '$lib/scan/scan.worker?worker';
	import Button from '$lib/ui/Button.svelte';
	import Notice from '$lib/ui/Notice.svelte';
	import Segmented from '$lib/ui/Segmented.svelte';

	type WorkerSuccess = Omit<ScanSuccess, 'preview'> & {
		preview: { dataUrl: string; width: number; height: number; scale: number };
	};

	interface Props {
		project: Project;
		onsave: () => Promise<void>;
		targetHref: string;
		curveHref: string;
	}

	let { project = $bindable(), onsave, targetHref, curveHref }: Props = $props();

	let selected = $state(project.rounds.length);
	let busy = $state<string | null>(null);
	let failure = $state<{ code: string; params: Record<string, number | string> } | null>(null);
	let dragging = $state(false);
	let justSaved = $state(false);
	let lastFile = $state<File | null>(null);
	let input: HTMLInputElement | undefined = $state();

	const round = $derived<Round | undefined>(project.rounds[selected - 1]);
	const scan = $derived(round?.scan);
	const outliers = $derived(scan ? scan.overlays.filter((o) => o.outlier).length : 0);
	/** Un diagnostico de severidad error invalida el escaneo: no se da por bueno ni entra a la curva. */
	const scanHasError = $derived(Boolean(scan?.diagnostics.some((d) => d.severity === 'error')));
	let zoom: HTMLDialogElement | undefined = $state();

	/** Tiempo maximo de analisis antes de darlo por fallido (escaneos enormes). */
	const ANALYSIS_TIMEOUT_MS = 180_000;

	function analyze(file: File, flatField: 'auto' | 'off') {
		const target = round;
		if (!target) return;
		lastFile = file;
		failure = null;
		justSaved = false;
		busy = file.name;
		void file.arrayBuffer().then((bytes) => {
			const worker = new ScanWorker();
			const crash = () => {
				clearTimeout(timer);
				worker.terminate();
				failure = { code: 'WORKER_CRASHED', params: {} };
				busy = null;
			};
			const timer = setTimeout(crash, ANALYSIS_TIMEOUT_MS);
			worker.onerror = crash;
			worker.onmessageerror = crash;
			worker.onmessage = async (event: MessageEvent<ScanOutcome | WorkerSuccess>) => {
				clearTimeout(timer);
				worker.terminate();
				const outcome = event.data;
				if (!outcome.ok) {
					failure = { code: outcome.code, params: outcome.params };
					busy = null;
					return;
				}
				const result = outcome as WorkerSuccess;
				const uneven = result.diagnostics.find((d) => d.code === 'UNEVEN_EXPOSURE');
				const record: ScanRecord = {
					fileName: result.fileName,
					analyzedAt: new Date().toISOString(),
					width: result.width,
					height: result.height,
					bitDepth: result.bitDepth,
					dpi: result.dpi,
					patches: result.patches,
					mirrored: result.mirrored,
					rotationDegrees: result.rotationDegrees,
					flatFieldApplied: result.flatFieldApplied,
					unevenExposureL: uneven ? Number(uneven.params?.spanL ?? 0) : null,
					diagnostics: result.diagnostics,
					preview: {
						dataUrl: result.preview.dataUrl,
						width: result.preview.width,
						height: result.preview.height
					},
					overlays: result.overlays.map((o) => ({
						value: o.value,
						corners: o.corners as [number, number][],
						outlier: o.outlier
					})),
					markers: result.markers as [number, number][][]
				};
				target.scan = record;
				await onsave();
				busy = null;
				justSaved = true;
			};
			worker.postMessage({ bytes, fileName: file.name, layout: $state.snapshot(target.layout), flatField }, [
				bytes
			]);
		});
	}

	function onFiles(files: FileList | null | undefined) {
		const file = files?.[0];
		if (file) analyze(file, 'off');
	}

	function errorText(code: string, params: Record<string, number | string>): string {
		const key = `scan.error.${code}` as MessageKey;
		if (code === 'MARKERS_NOT_FOUND') {
			const missing = String(params.missing ?? '')
				.split(',')
				.filter(Boolean).length;
			return i18n.t('scan.error.MARKERS_NOT_FOUND', { count: missing || 4 });
		}
		const known = [
			'WORKER_CRASHED',
			'GEOMETRY_INCONSISTENT',
			'CORRUPT_FILE',
			'UNSUPPORTED_FORMAT',
			'UNSUPPORTED_BIT_DEPTH',
			'UNSUPPORTED_LAYOUT'
		];
		return known.includes(code) ? i18n.t(key, params) : i18n.t('scan.error.UNKNOWN');
	}

	const points = (corners: readonly (readonly [number, number])[]) =>
		corners.map(([x, y]) => `${x},${y}`).join(' ');
</script>

{#snippet uploadIcon()}<Upload size={18} aria-hidden="true" />{/snippet}
{#snippet zoomIcon()}<Maximize2 size={18} aria-hidden="true" />{/snippet}
{#snippet overlay(preview: { width: number; height: number; dataUrl: string }, record: ScanRecord)}
	<img src={preview.dataUrl} alt="" width={preview.width} height={preview.height} />
	<svg viewBox="0 0 {preview.width} {preview.height}" aria-hidden="true">
		{#each record.overlays as item, i (i)}
			<polygon class="halo" points={points(item.corners)} />
			<polygon class="patch" class:outlier={item.outlier} points={points(item.corners)} />
		{/each}
		{#each record.markers as marker, i (i)}
			<polygon class="halo" points={points(marker)} />
			<polygon class="marker" points={points(marker)} />
		{/each}
	</svg>
{/snippet}

<section class="step" aria-labelledby="scan-title">
	<header>
		<h1 id="scan-title">{i18n.t('scan.title')}</h1>
		<p class="lead">{i18n.t('scan.lead')}</p>
	</header>

	{#if project.rounds.length === 0}
		<Notice tone="info" title={i18n.t('scan.none.title')}>
			<p>{i18n.t('scan.none.body')}</p>
		</Notice>
		<Button variant="primary" href={targetHref}>{i18n.t('scan.none.action')}</Button>
	{:else}
		{#if project.rounds.length > 1}
			<Segmented
				name="print"
				legend={i18n.t('scan.print')}
				options={project.rounds.map((_, i) => ({
					value: i + 1,
					label: i18n.t('scan.print.option', { print: i + 1 })
				}))}
				value={selected}
				onchange={(value) => {
					selected = value;
					failure = null;
					justSaved = false;
				}}
			/>
		{/if}

		<input
			bind:this={input}
			class="visually-hidden"
			type="file"
			accept=".tif,.tiff,.png,.jpg,.jpeg,image/tiff,image/png,image/jpeg"
			tabindex="-1"
			onchange={(event) => onFiles(event.currentTarget.files)}
		/>

		{#if busy && !scan}
			<div class="analyzing" role="status" aria-live="polite">
				<ScanLine class="pulse" size={32} aria-hidden="true" />
				<p>{i18n.t('scan.analyzing', { file: busy })}</p>
			</div>
		{:else if scan}
			{#if busy}
				<p class="reanalyzing" role="status" aria-live="polite">
					<ScanLine class="pulse" size={18} aria-hidden="true" />
					{i18n.t('scan.analyzing', { file: busy })}
				</p>
			{/if}
			<!-- Mientras se reanaliza, el resultado anterior se conserva atenuado: sin saltos. -->
			<div class="result" class:stale={Boolean(busy)} inert={Boolean(busy)}>
				<figure class="preview" aria-label={i18n.t('scan.result')}>
					<div class="stage" style:--ratio={scan.preview.width / scan.preview.height}>
						{@render overlay(scan.preview, scan)}
					</div>
					<figcaption>
						{i18n.t('scan.summary', {
							file: scan.fileName,
							width: scan.width,
							height: scan.height,
							bits: scan.bitDepth
						})}
						{#if Math.abs(scan.rotationDegrees) > 0.5}
							· {i18n.t('scan.summary.rotation', { degrees: Math.round(scan.rotationDegrees) })}
						{/if}
					</figcaption>
				</figure>

				<div class="side">
					<p class="count">
						<strong>{i18n.t('scan.measured', { count: scan.patches.length })}</strong>
						{#if outliers > 0}<br />{i18n.t('scan.outliers', { count: outliers })}{/if}
					</p>

					<Button variant="ghost" icon={zoomIcon} onclick={() => zoom?.showModal()}
						>{i18n.t('scan.zoom')}</Button
					>

					{#if justSaved && !scanHasError}
						<Notice tone="success">{i18n.t('scan.saved', { print: selected })}</Notice>
					{/if}

					{#each scan.diagnostics as diagnostic (diagnostic.code)}
						<Notice
							tone={diagnostic.severity === 'error'
								? 'error'
								: diagnostic.severity === 'warning'
									? 'warning'
									: 'info'}
						>
							{i18n.t(`scan.diag.${diagnostic.code}` as MessageKey, diagnostic.params ?? {})}
						</Notice>
					{/each}

					{#if scan.unevenExposureL !== null && lastFile}
						<label class="check">
							<input
								type="checkbox"
								checked={scan.flatFieldApplied}
								onchange={(event) =>
									lastFile && analyze(lastFile, event.currentTarget.checked ? 'auto' : 'off')}
							/>
							<span>
								{i18n.t('scan.flatfield.apply')}
								<span class="hint">{i18n.t('scan.flatfield.hint')}</span>
							</span>
						</label>
					{/if}

					{#if scanHasError}
						<p class="hint">{i18n.t('scan.excluded')}</p>
					{/if}
					<div class="actions">
						{#if scanHasError}
							<Button variant="primary" icon={uploadIcon} onclick={() => input?.click()}
								>{i18n.t('scan.replace')}</Button
							>
							<Button variant="secondary" href={curveHref}>{i18n.t('scan.next')}</Button>
						{:else}
							<Button variant="primary" href={curveHref}>{i18n.t('scan.next')}</Button>
							<Button variant="secondary" icon={uploadIcon} onclick={() => input?.click()}
								>{i18n.t('scan.replace')}</Button
							>
						{/if}
					</div>
				</div>
			</div>
		{:else}
			<div
				class="drop"
				class:dragging
				role="group"
				aria-labelledby="drop-title"
				ondragover={(event) => {
					event.preventDefault();
					dragging = true;
				}}
				ondragleave={() => (dragging = false)}
				ondrop={(event) => {
					event.preventDefault();
					dragging = false;
					onFiles(event.dataTransfer?.files);
				}}
			>
				<Upload size={32} aria-hidden="true" />
				<p id="drop-title" class="drop-title">{i18n.t('scan.drop.title')}</p>
				<p class="hint">{i18n.t('scan.drop.or')}</p>
				<Button variant="primary" onclick={() => input?.click()}>{i18n.t('scan.drop.choose')}</Button>
				<p class="hint formats">{i18n.t('scan.drop.formats')}</p>
			</div>

			<div class="tips">
				<h2>{i18n.t('scan.tips.title')}</h2>
				<ul>
					<li>{i18n.t('scan.tips.auto')}</li>
					<li>{i18n.t('scan.tips.depth')}</li>
					<li>{i18n.t('scan.tips.resolution')}</li>
					<li>{i18n.t('scan.tips.same')}</li>
				</ul>
			</div>
		{/if}

		{#if failure}
			<Notice tone="error" title={i18n.t('scan.error.title')}>
				<p>{errorText(failure.code, failure.params)}</p>
			</Notice>
		{/if}
	{/if}
</section>

{#if scan}
	<dialog bind:this={zoom} class="zoom" aria-labelledby="zoom-title">
		<header class="zoom-header">
			<h2 id="zoom-title">{i18n.t('scan.zoom.title')}</h2>
			<Button variant="secondary" onclick={() => zoom?.close()}>{i18n.t('scan.zoom.close')}</Button>
		</header>
		<div class="zoom-body">
			<div class="zoom-stage" style:width="{scan.preview.width}px" style:height="{scan.preview.height}px">
				{@render overlay(scan.preview, scan)}
			</div>
		</div>
	</dialog>
{/if}

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
		max-width: 56ch;
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
		max-width: 44ch;
		margin-block-start: var(--space-2);
	}

	.analyzing {
		display: grid;
		justify-items: center;
		gap: var(--space-3);
		padding: var(--space-12) var(--space-6);
		border-radius: var(--radius-lg);
		background: var(--surface-sunken);
		color: var(--text-secondary);
	}

	.analyzing p {
		margin: 0;
	}

	.analyzing :global(.pulse) {
		animation: pulse var(--duration-slow) var(--ease-standard) infinite alternate;
	}

	@keyframes pulse {
		from {
			opacity: 0.4;
		}
		to {
			opacity: 1;
		}
	}

	.tips {
		padding: var(--space-4);
		border: var(--border-width) solid var(--border-subtle);
		border-radius: var(--radius-md);
	}

	.tips h2 {
		margin: 0 0 var(--space-2);
		font-size: var(--text-base);
	}

	.tips ul {
		margin: 0;
		padding-inline-start: var(--space-4);
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	.tips li + li {
		margin-block-start: var(--space-1);
	}

	.result {
		display: grid;
		gap: var(--space-6);
		align-items: start;
		transition: opacity var(--duration-base) var(--ease-standard);
	}

	.result.stale {
		opacity: 0.55;
	}

	.reanalyzing {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	.reanalyzing :global(.pulse) {
		animation: pulse var(--duration-slow) var(--ease-standard) infinite alternate;
	}

	.zoom {
		width: min(96vw, 100rem);
		max-height: 92vh;
		padding: 0;
		border: var(--border-width) solid var(--border-subtle);
		border-radius: var(--radius-lg);
		background: var(--surface-raised);
		color: var(--text-primary);
	}

	.zoom::backdrop {
		background: var(--scrim);
	}

	.zoom-header {
		position: sticky;
		inset-block-start: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-3) var(--space-4);
		border-block-end: var(--border-width) solid var(--border-subtle);
		background: var(--surface-raised);
	}

	.zoom-header h2 {
		margin: 0;
		font-size: var(--text-lg);
	}

	/* Tamano natural de la miniatura (1 px = 1 px): se recorre con desplazamiento. */
	.zoom-body {
		overflow: auto;
		padding: var(--space-4);
		background: var(--surface-canvas);
	}

	.zoom-stage {
		position: relative;
		max-width: none;
	}

	.zoom-stage :global(img),
	.zoom-stage :global(svg) {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
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

	.stage {
		--preview-height: 45vh;
		position: relative;
		width: min(100%, calc(var(--preview-height) * var(--ratio)));
		aspect-ratio: var(--ratio);
	}

	.stage :global(img),
	.stage :global(svg) {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}

	/* Trazos dobles (halo oscuro + linea clara) visibles sobre papel blanco y sobre azul. */
	:global(.stage polygon),
	:global(.zoom-stage polygon) {
		fill: none;
		vector-effect: non-scaling-stroke;
	}

	:global(.halo) {
		stroke: var(--overlay-halo);
		stroke-width: 3;
	}

	:global(.patch) {
		stroke: var(--overlay-line);
		stroke-width: 1.25;
	}

	:global(.patch.outlier) {
		stroke: var(--overlay-warning);
		stroke-dasharray: 4 3;
	}

	:global(.marker) {
		stroke: var(--overlay-marker);
		stroke-width: 2;
	}

	figcaption {
		justify-self: start;
		color: var(--text-secondary);
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
		overflow-wrap: anywhere;
	}

	.side {
		display: grid;
		gap: var(--space-4);
		justify-items: start;
	}

	.count {
		margin: 0;
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	.count strong {
		color: var(--text-primary);
		font-size: var(--text-lg);
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

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.hint {
		margin: 0;
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	@media (min-width: 64rem) {
		.result {
			grid-template-columns: minmax(0, 3fr) minmax(18rem, 2fr);
		}

		.stage {
			--preview-height: 70vh;
		}
	}
</style>
