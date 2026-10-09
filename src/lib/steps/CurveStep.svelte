<script lang="ts">
	import { Check } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import type { FitMethod, MeasuredPatch } from '$lib/core/curve/types';
	import type { CurveComputation, CurveFailure } from '$lib/curve/compute';
	import { includedPatches, runCurve } from '$lib/curve/run';
	import { i18n, type MessageKey } from '$lib/i18n/index.svelte';
	import type { Project } from '$lib/project/types';
	import Button from '$lib/ui/Button.svelte';
	import LineChart from '$lib/ui/LineChart.svelte';
	import Notice from '$lib/ui/Notice.svelte';
	import Segmented from '$lib/ui/Segmented.svelte';

	interface Props {
		project: Project;
		onsave: () => Promise<void>;
		scanHref: string;
		exportHref: string;
	}

	let { project = $bindable(), onsave, scanHref, exportHref }: Props = $props();

	type View = 'correction' | 'response';
	let view = $state<View>('correction');
	let result = $state<CurveComputation | null>(null);
	let failure = $state<CurveFailure | null>(null);
	let computing = $state(false);

	const scanned = $derived(
		project.rounds.map((round, i) => ({ print: i + 1, round })).filter((entry) => entry.round.scan)
	);
	const excluded = $derived(new Set(project.curve?.excludedPrints ?? []));
	const patches = $derived<MeasuredPatch[]>(includedPatches(project.rounds, project.curve?.excludedPrints));

	// Recalcula en el worker cuando cambian las mediciones incluidas.
	$effect(() => {
		const input = $state.snapshot(patches);
		if (input.length === 0) {
			result = null;
			failure = null;
			return;
		}
		computing = true;
		const run = runCurve(input);
		void run.promise.then((outcome) => {
			computing = false;
			if (outcome.ok) {
				result = outcome;
				failure = null;
			} else {
				failure = outcome;
			}
		});
		return () => run.cancel();
	});

	const method = $derived<FitMethod | null>(
		result
			? (result.candidates.find((c) => c.method === project.curve?.method && c.curve)?.method ??
					result.recommended)
			: null
	);
	const selected = $derived(result?.candidates.find((c) => c.method === method) ?? null);

	async function choose(next: FitMethod) {
		project.curve = { method: next, excludedPrints: [...excluded] };
		await onsave();
	}

	async function togglePrint(print: number, include: boolean) {
		const others = [...excluded].filter((p) => p !== print);
		project.curve = {
			method: untrack(() => method) ?? 'smooth',
			excludedPrints: include ? others : [...others, print]
		};
		await onsave();
	}

	const identity = Array.from({ length: 256 }, (_, i) => i);
	const lightnessDomain = $derived.by((): [number, number] => {
		if (!result) return [0, 100];
		const values = result.points.map((p) => p.lightness);
		return [
			Math.max(0, Math.floor((Math.min(...values) - 5) / 10) * 10),
			Math.min(100, Math.ceil((Math.max(...values) + 5) / 10) * 10)
		];
	});

	const fmt = (value: number, digits = 1) =>
		new Intl.NumberFormat(i18n.locale, {
			maximumFractionDigits: digits,
			minimumFractionDigits: digits
		}).format(value);
	const diagnostics = $derived([
		...(result?.data.diagnostics ?? []),
		...(selected?.report.diagnostics ?? [])
	]);
	const tone = (severity: string) =>
		severity === 'error' ? 'error' : severity === 'warning' ? 'warning' : 'info';
	const errorKey = (code: string) =>
		(['TOO_FEW_VALUES', 'NOT_DECREASING', 'INVALID_MEASUREMENT', 'LOW_RANGE'].includes(code)
			? `curve.error.${code}`
			: 'curve.error.UNKNOWN') as MessageKey;
	const tableTones = Array.from({ length: 18 }, (_, i) => Math.min(i * 15, 255));
</script>

<section class="step" aria-labelledby="curve-title">
	<header>
		<h1 id="curve-title">{i18n.t('curve.title')}</h1>
		<p class="lead">{i18n.t('curve.lead')}</p>
	</header>

	{#if scanned.length === 0}
		<Notice tone="info" title={i18n.t('curve.none.title')}><p>{i18n.t('curve.none.body')}</p></Notice>
		<Button variant="primary" href={scanHref}>{i18n.t('curve.none.action')}</Button>
	{:else}
		{#if scanned.length > 1}
			<fieldset class="prints">
				<legend>{i18n.t('curve.prints')}</legend>
				{#each scanned as entry (entry.print)}
					<label>
						<input
							type="checkbox"
							checked={!excluded.has(entry.print)}
							onchange={(event) => togglePrint(entry.print, event.currentTarget.checked)}
						/>
						{i18n.t('scan.print.option', { print: entry.print })}
					</label>
				{/each}
			</fieldset>
		{/if}

		{#if failure}
			<Notice tone="error" title={i18n.t('curve.error.title')}>
				<p>{i18n.t(errorKey(failure.code), failure.params)}</p>
			</Notice>
		{/if}

		{#if result && selected}
			<div class="layout" class:stale={computing}>
				<div class="main">
					<Segmented
						name="view"
						legend={i18n.t('curve.view')}
						hideLegend
						options={[
							{ value: 'correction' as View, label: i18n.t('curve.view.correction') },
							{ value: 'response' as View, label: i18n.t('curve.view.response') }
						]}
						bind:value={view}
					/>
					{#if view === 'correction' && selected.curve}
						<LineChart
							label={i18n.t('curve.chart.correction')}
							xLabel={i18n.t('curve.axis.input')}
							yLabel={i18n.t('curve.axis.output')}
							yDomain={[0, 255]}
							yTicks={[0, 64, 128, 191, 255]}
							formatY={(v) => fmt(v, 0)}
							lines={[
								{
									id: 'identity',
									label: i18n.t('curve.series.identity'),
									color: 'var(--chart-reference)',
									values: identity,
									reference: true
								},
								{
									id: 'correction',
									label: i18n.t('curve.series.correction'),
									color: 'var(--chart-model)',
									values: selected.curve.samples
								}
							]}
						/>
					{:else}
						<LineChart
							label={i18n.t('curve.chart.response')}
							xLabel={i18n.t('curve.axis.negative')}
							yLabel={i18n.t('curve.axis.lightness')}
							yDomain={lightnessDomain}
							formatY={(v) => fmt(v)}
							band={selected.curve
								? {
										from: selected.curve.usable.whiteEdge,
										to: selected.curve.usable.blackEdge,
										label: i18n.t('curve.band')
									}
								: null}
							lines={[
								{
									id: 'model',
									label: i18n.t('curve.series.model'),
									color: 'var(--chart-model)',
									values: selected.response
								}
							]}
							dots={{
								id: 'measured',
								label: i18n.t('curve.series.measured'),
								color: 'var(--chart-measured)',
								points: result.points.map((p) => ({
									x: p.value,
									y: p.lightness,
									hollow: p.weight < p.replicates
								}))
							}}
						/>
						{#if selected.curve}
							<p class="caption">
								{i18n.t('curve.band')}:
								{i18n.t('curve.metric.usable.value', {
									percent: Math.round((selected.report.usableFraction ?? 0) * 100),
									from: Math.round(selected.curve.usable.whiteEdge),
									to: Math.round(selected.curve.usable.blackEdge)
								})}
							</p>
						{/if}
					{/if}

					<details class="table">
						<summary>{i18n.t('curve.table')}</summary>
						{#if view === 'correction' && selected.curve}
							<table>
								<thead>
									<tr>
										<th scope="col">{i18n.t('curve.table.input')}</th>
										<th scope="col">{i18n.t('curve.table.output')}</th>
										<th scope="col">{i18n.t('curve.table.negative')}</th>
									</tr>
								</thead>
								<tbody>
									{#each tableTones as p (p)}
										<tr>
											<td>{p}</td>
											<td>{fmt(selected.curve.samples[p] ?? 0)}</td>
											<td>{fmt(selected.curve.negative[p] ?? 0)}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{:else}
							<table>
								<thead>
									<tr>
										<th scope="col">{i18n.t('curve.table.value')}</th>
										<th scope="col">{i18n.t('curve.table.lightness')}</th>
										<th scope="col">{i18n.t('curve.table.replicates')}</th>
									</tr>
								</thead>
								<tbody>
									{#each result.points as point (point.value)}
										<tr>
											<td>{point.value}</td>
											<td>{fmt(point.lightness)}</td>
											<td>{point.replicates}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{/if}
					</details>
				</div>

				<div class="side">
					<fieldset class="methods">
						<legend>{i18n.t('curve.methods')}</legend>
						{#each result.candidates as candidate (candidate.method)}
							<label class="method" class:disabled={!candidate.curve}>
								<input
									type="radio"
									name="method"
									value={candidate.method}
									checked={candidate.method === method}
									disabled={!candidate.curve}
									onchange={() => choose(candidate.method)}
								/>
								<span class="method-body">
									<span class="method-name">
										{i18n.t(`curve.method.${candidate.method}` as MessageKey)}
										{#if candidate.method === result.recommended}
											<span class="badge"
												><Check size={14} aria-hidden="true" /> {i18n.t('curve.method.recommended')}</span
											>
										{/if}
									</span>
									<span class="method-hint"
										>{i18n.t(`curve.method.${candidate.method}.hint` as MessageKey)}</span
									>
									{#if candidate.looRmse !== null}
										<span class="method-error"
											>{i18n.t('curve.method.error', { error: fmt(candidate.looRmse, 2) })}</span
										>
									{/if}
								</span>
							</label>
						{/each}
					</fieldset>

					{#if selected.curve}
						<section class="metrics" aria-labelledby="metrics-title">
							<h2 id="metrics-title">{i18n.t('curve.metrics')}</h2>
							<dl>
								<div>
									<dt>{i18n.t('curve.metric.paper')}</dt>
									<dd>L* {fmt(selected.report.paperLightness)}</dd>
								</div>
								<div>
									<dt>{i18n.t('curve.metric.dmax')}</dt>
									<dd>L* {fmt(selected.report.dmaxLightness)}</dd>
								</div>
								<div>
									<dt>{i18n.t('curve.metric.density')}</dt>
									<dd>{fmt(selected.report.densityRange ?? 0, 2)} D</dd>
								</div>
								<div>
									<dt>{i18n.t('curve.metric.usable')}</dt>
									<dd>
										{i18n.t('curve.metric.usable.value', {
											percent: Math.round((selected.report.usableFraction ?? 0) * 100),
											from: Math.round(selected.curve.usable.whiteEdge),
											to: Math.round(selected.curve.usable.blackEdge)
										})}
									</dd>
								</div>
								<div>
									<dt>{i18n.t('curve.metric.noise')}</dt>
									<dd>σ {fmt(result.data.noise, 2)} L*</dd>
								</div>
							</dl>
						</section>
					{/if}

					{#each diagnostics as diagnostic, i (i)}
						<Notice tone={tone(diagnostic.severity)}>
							{i18n.t(`curve.diag.${diagnostic.code}` as MessageKey, diagnostic.params ?? {})}
						</Notice>
					{/each}

					<Button variant="primary" href={exportHref}>{i18n.t('curve.next')}</Button>
				</div>
			</div>
		{:else if computing}
			<p class="computing" role="status">{i18n.t('curve.computing')}</p>
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

	.prints {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-4);
		margin: 0;
		padding: 0;
		border: 0;
	}

	.prints legend {
		margin-block-end: var(--space-1);
		padding: 0;
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
	}

	.prints label {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--target-min);
		cursor: pointer;
	}

	input[type='checkbox'],
	input[type='radio'] {
		width: var(--space-4);
		height: var(--space-4);
		margin: 0;
		accent-color: var(--action-primary);
	}

	.layout {
		display: grid;
		gap: var(--space-8);
		align-items: start;
		transition: opacity var(--duration-base) var(--ease-standard);
	}

	/* Mientras recalcula se conserva el grafico anterior, atenuado: sin saltos ni parpadeo. */
	.layout.stale {
		opacity: 0.55;
	}

	.main,
	.side {
		display: grid;
		gap: var(--space-4);
		min-width: 0;
	}

	.side {
		justify-items: start;
	}

	.caption,
	.computing {
		margin: 0;
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	.table summary {
		min-height: var(--target-min);
		color: var(--text-link);
		font-size: var(--text-sm);
		cursor: pointer;
	}

	table {
		width: 100%;
		margin-block-start: var(--space-2);
		border-collapse: collapse;
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
	}

	th,
	td {
		padding: var(--space-1) var(--space-2);
		border-block-end: var(--border-width) solid var(--border-subtle);
		text-align: end;
	}

	th:first-child,
	td:first-child {
		text-align: start;
	}

	th {
		color: var(--text-secondary);
		font-weight: var(--weight-medium);
	}

	.methods {
		display: grid;
		gap: var(--space-2);
		width: 100%;
		margin: 0;
		padding: 0;
		border: 0;
	}

	.methods legend {
		margin-block-end: var(--space-2);
		padding: 0;
		font-weight: var(--weight-semibold);
	}

	.method {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--space-3);
		padding: var(--space-3);
		border: var(--border-width) solid var(--border-subtle);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition:
			border-color var(--duration-fast) var(--ease-standard),
			background-color var(--duration-fast) var(--ease-standard);
	}

	.method:hover:not(.disabled) {
		background: var(--surface-sunken);
	}

	.method:has(input:checked) {
		border-color: var(--action-primary);
		background: var(--surface-raised);
	}

	.method:has(input:focus-visible) {
		outline: var(--focus-width) solid var(--focus-ring);
		outline-offset: var(--focus-offset);
	}

	.method.disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	.method input {
		margin-block-start: var(--space-1);
	}

	.method-body {
		display: grid;
		gap: var(--space-1);
	}

	.method-name {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		font-weight: var(--weight-medium);
	}

	.badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--feedback-success);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
	}

	.method-hint,
	.method-error {
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	.method-error {
		font-variant-numeric: tabular-nums;
	}

	.metrics {
		width: 100%;
	}

	.metrics h2 {
		margin: 0 0 var(--space-2);
		font-size: var(--text-base);
	}

	dl {
		display: grid;
		margin: 0;
	}

	dl div {
		display: flex;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-2) 0;
		border-block-end: var(--border-width) solid var(--border-subtle);
		font-size: var(--text-sm);
	}

	dt {
		color: var(--text-secondary);
	}

	dd {
		margin: 0;
		font-variant-numeric: tabular-nums;
		text-align: end;
	}

	@media (min-width: 64rem) {
		.layout {
			grid-template-columns: minmax(0, 3fr) minmax(18rem, 2fr);
		}
	}
</style>
