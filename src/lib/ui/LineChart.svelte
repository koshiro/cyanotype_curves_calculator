<script lang="ts">
	/**
	 * Grafico de lineas y puntos sobre un eje X entero (0..255), segun la skill de dataviz:
	 * lineas de 2px, puntos >= 8px con anillo del color de fondo, grilla fina recesiva, leyenda
	 * para 2+ series, cursor que salta al X mas cercano con lectura de todas las series, y
	 * navegacion por teclado (flechas; Mayus para saltos de 15). Los textos usan tokens de texto.
	 */
	import { i18n } from '$lib/i18n/index.svelte';
	import type { ChartDots, ChartLine } from './chart-types';

	interface Props {
		label: string;
		xLabel: string;
		yLabel: string;
		yDomain: readonly [number, number];
		lines: readonly ChartLine[];
		dots?: ChartDots;
		/** Franja sombreada en X (p. ej. el rango util del negativo). */
		band?: { from: number; to: number; label: string } | null;
		formatY?: (value: number) => string;
		xTicks?: readonly number[];
		yTicks?: readonly number[];
		/** Etiqueta corta del eje X para la lectura de lectores de pantalla. */
		xShort?: string;
		/** Area de trazado cuadrada (curvas 0..255 → 0..255, como en Photoshop y GIMP). */
		square?: boolean;
	}

	let {
		label,
		xLabel,
		yLabel,
		yDomain,
		lines,
		dots,
		band = null,
		formatY = (v) => v.toFixed(1),
		xTicks = [0, 64, 128, 191, 255],
		yTicks,
		xShort,
		square = false
	}: Props = $props();

	let width = $state(640);
	const margin = { top: 16, right: 20, bottom: 44, left: 52 };
	/** Ancho disponible para el area de trazado; en modo cuadrado se limita para no crecer de mas. */
	const plotW = $derived(Math.max(Math.min(width - margin.left - margin.right, square ? 480 : Infinity), 10));
	const height = $derived(
		square
			? Math.round(plotW + margin.top + margin.bottom)
			: Math.round(Math.min(Math.max(width * 0.62, 240), 440))
	);
	const plotH = $derived(height - margin.top - margin.bottom);
	const sx = (x: number) => margin.left + (x / 255) * plotW;
	const sy = (y: number) => margin.top + (1 - (y - yDomain[0]) / (yDomain[1] - yDomain[0])) * plotH;
	const ticksY = $derived(
		yTicks ??
			Array.from({ length: 5 }, (_, i) => yDomain[0] + ((yDomain[1] - yDomain[0]) * i) / 4).map((v) =>
				Math.round(v)
			)
	);

	const path = (values: readonly number[]) =>
		values.map((y, x) => `${x === 0 ? 'M' : 'L'}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join('');

	const series = $derived(lines.filter((l) => !l.reference));
	const legendItems = $derived([
		...series.map((l) => ({ id: l.id, label: l.label, color: l.color, kind: 'line' as const })),
		...(dots ? [{ id: dots.id, label: dots.label, color: dots.color, kind: 'dot' as const }] : [])
	]);

	/** Con muchos puntos se achican y pierden el anillo, para no tapar la linea del modelo. */
	const dense = $derived((dots?.points.length ?? 0) > 30);

	let cursor = $state<number | null>(null);
	/** En pantallas tactiles el cursor queda fijo tras tocar, hasta tocar fuera o pulsar Escape. */
	let pinned = $state(false);
	let svg: SVGSVGElement | undefined = $state();

	/** Con puntos medidos, el cursor salta al punto mas cercano: la lectura compara la misma X. */
	function snap(x: number): number {
		const clamped = Math.min(Math.max(Math.round(x), 0), 255);
		if (!dots || dots.points.length === 0) return clamped;
		return dots.points.reduce(
			(best, p) => (Math.abs(p.x - clamped) < Math.abs(best - clamped) ? p.x : best),
			dots.points[0]!.x
		);
	}

	function pointerToX(event: PointerEvent): number {
		const rect = svg!.getBoundingClientRect();
		return snap(((event.clientX - rect.left - margin.left) / plotW) * 255);
	}

	function onpointerdown(event: PointerEvent) {
		if (event.pointerType !== 'touch') return;
		pinned = true;
		cursor = pointerToX(event);
	}

	$effect(() => {
		if (!pinned) return;
		const release = (event: PointerEvent) => {
			if (svg && !svg.contains(event.target as Node)) {
				pinned = false;
				cursor = null;
			}
		};
		document.addEventListener('pointerdown', release);
		return () => document.removeEventListener('pointerdown', release);
	});

	function onkey(event: KeyboardEvent) {
		const step = event.shiftKey ? 15 : 1;
		if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
			event.preventDefault();
			const base = cursor ?? 128;
			const direction = event.key === 'ArrowRight' ? 1 : -1;
			if (dots && dots.points.length > 0) {
				// Con puntos medidos, las flechas recorren los puntos (Mayus salta de a 5).
				const xs = dots.points
					.map((p) => p.x)
					.filter((v, i, all) => all.indexOf(v) === i)
					.sort((a, b) => a - b);
				const index = xs.indexOf(snap(base));
				cursor = xs[Math.min(Math.max(index + direction * (event.shiftKey ? 5 : 1), 0), xs.length - 1)]!;
			} else {
				cursor = Math.min(Math.max(base + direction * step, 0), 255);
			}
		} else if (event.key === 'Home') {
			cursor = 0;
		} else if (event.key === 'End') {
			cursor = 255;
		} else if (event.key === 'Escape') {
			cursor = null;
			pinned = false;
		}
	}

	const nearestDot = $derived.by(() => {
		if (cursor === null || !dots) return null;
		let best: { x: number; y: number } | null = null;
		for (const p of dots.points) if (p.x === cursor) best = p;
		return best;
	});
	const tooltipLeft = $derived(cursor === null ? 0 : sx(cursor));
	/** Lectura textual del cursor para lectores de pantalla (mismos datos que el tooltip). */
	const readout = $derived.by(() => {
		const x = cursor ?? 128;
		const parts = series.map((l) => `${l.label} ${formatY(l.values[x] ?? 0)}`);
		const measured = dots?.points.find((p) => p.x === x);
		if (measured && dots) parts.push(`${dots.label} ${formatY(measured.y)}`);
		return `${xShort ?? xLabel} ${x}: ${parts.join(', ')}`;
	});
</script>

<div class="chart" bind:clientWidth={width}>
	{#if legendItems.length >= 2}
		<ul class="legend">
			{#each legendItems as item (item.id)}
				<li>
					<svg class="key" viewBox="0 0 16 10" aria-hidden="true">
						{#if item.kind === 'line'}
							<line
								x1="0"
								y1="5"
								x2="16"
								y2="5"
								stroke={item.color}
								stroke-width="2"
								stroke-linecap="round"
							/>
						{:else}
							<circle cx="8" cy="5" r="4" fill={item.color} />
						{/if}
					</svg>
					{item.label}
				</li>
			{/each}
		</ul>
	{/if}

	<div class="plot">
		<svg
			bind:this={svg}
			{width}
			{height}
			viewBox="0 0 {width} {height}"
			role="slider"
			aria-roledescription={i18n.t('chart.role')}
			aria-label={label}
			aria-valuemin={0}
			aria-valuemax={255}
			aria-valuenow={cursor ?? 128}
			aria-valuetext={readout}
			tabindex="0"
			onpointermove={(event) => {
				if (event.pointerType !== 'touch') cursor = pointerToX(event);
			}}
			{onpointerdown}
			onpointerleave={(event) => {
				if (event.pointerType !== 'touch' && !pinned) cursor = null;
			}}
			onkeydown={onkey}
			onblur={() => {
				if (!pinned) cursor = null;
			}}
		>
			{#if band}
				<!-- Se sombrea lo que queda fuera del rango util: es lo que el negativo desperdicia. -->
				<rect
					class="band"
					x={margin.left}
					y={margin.top}
					width={Math.max(sx(band.from) - margin.left, 0)}
					height={plotH}
				/>
				<rect
					class="band"
					x={sx(band.to)}
					y={margin.top}
					width={Math.max(margin.left + plotW - sx(band.to), 0)}
					height={plotH}
				/>
			{/if}

			{#each ticksY as tick (tick)}
				<line class="grid" x1={margin.left} x2={margin.left + plotW} y1={sy(tick)} y2={sy(tick)} />
				<text class="tick" x={margin.left - 8} y={sy(tick)} text-anchor="end" dominant-baseline="middle"
					>{tick}</text
				>
			{/each}
			{#each xTicks as tick (tick)}
				<text class="tick" x={sx(tick)} y={margin.top + plotH + 18} text-anchor="middle">{tick}</text>
			{/each}
			<line
				class="axis"
				x1={margin.left}
				x2={margin.left + plotW}
				y1={margin.top + plotH}
				y2={margin.top + plotH}
			/>

			<text class="axis-label" x={margin.left + plotW / 2} y={height - 6} text-anchor="middle">{xLabel}</text>
			<text
				class="axis-label"
				transform="translate(14 {margin.top + plotH / 2}) rotate(-90)"
				text-anchor="middle">{yLabel}</text
			>

			<!-- Puntos debajo y lineas encima: el modelo siempre se ve sobre las mediciones. -->
			{#if dots}
				{#each dots.points as point, i (i)}
					<circle
						class="dot"
						cx={sx(point.x)}
						cy={sy(point.y)}
						r={dense ? 2.5 : 4}
						fill={point.hollow ? 'var(--chart-surface)' : dots.color}
						stroke={point.hollow ? dots.color : dense ? 'none' : 'var(--chart-surface)'}
					/>
				{/each}
			{/if}

			{#each lines as line (line.id)}
				<path class="line" class:reference={line.reference} d={path(line.values)} stroke={line.color} />
			{/each}

			<!-- Etiquetas directas solo sin puntos (con puntos chocarian; la leyenda ya identifica). -->
			{#if !dots}
				{#each series as line (line.id)}
					{@const last = line.values.at(-1) ?? 0}
					<text
						class="direct"
						x={sx(255) - 8}
						y={Math.min(sy(last) + 18, margin.top + plotH - 6)}
						text-anchor="end">{line.label}</text
					>
				{/each}
			{/if}
			{#each lines.filter((l) => l.reference) as line (line.id)}
				<!-- En X bajos, bajo la diagonal: zona libre y sin riesgo de cortarse en pantallas angostas. -->
				<text class="tick" x={sx(48) + 4} y={sy(line.values[48] ?? 0) + 16}>{line.label}</text>
			{/each}

			{#if cursor !== null}
				<line class="crosshair" x1={sx(cursor)} x2={sx(cursor)} y1={margin.top} y2={margin.top + plotH} />
				{#each series as line (line.id)}
					<circle
						class="focus-dot"
						cx={sx(cursor)}
						cy={sy(line.values[cursor] ?? 0)}
						r="4"
						fill={line.color}
					/>
				{/each}
			{/if}
		</svg>

		{#if cursor !== null}
			<div class="tooltip" style:left="{tooltipLeft}px" class:flip={tooltipLeft > width * 0.6}>
				<p class="tooltip-x">{xLabel}: {cursor}</p>
				{#each series as line (line.id)}
					<p class="row">
						<span class="line-key" style:background={line.color}></span>
						<strong>{formatY(line.values[cursor] ?? 0)}</strong>
						<span>{line.label}</span>
					</p>
				{/each}
				{#if nearestDot && dots}
					<p class="row">
						<span class="dot-key" style:background={dots.color}></span>
						<strong>{formatY(nearestDot.y)}</strong>
						<span>{dots.label} ({nearestDot.x})</span>
					</p>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.chart {
		display: grid;
		gap: var(--space-2);
		width: 100%;
		min-width: 0;
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-4);
		margin: 0;
		padding: 0;
		color: var(--text-secondary);
		font-size: var(--text-sm);
		list-style: none;
	}

	.legend li {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}

	.key {
		width: var(--space-4);
		height: var(--space-3);
	}

	.plot {
		position: relative;
	}

	svg {
		display: block;
		max-width: 100%;
		border-radius: var(--radius-md);
		background: var(--chart-surface);
		touch-action: pan-y;
	}

	svg:focus-visible {
		outline: var(--focus-width) solid var(--focus-ring);
		outline-offset: var(--focus-offset);
	}

	.band {
		fill: var(--chart-reference);
		opacity: 0.18;
	}

	.grid {
		stroke: var(--chart-grid);
		stroke-width: 1;
	}

	.axis {
		stroke: var(--chart-reference);
		stroke-width: 1;
	}

	.tick,
	.axis-label,
	.direct {
		fill: var(--text-secondary);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}

	.direct {
		fill: var(--text-primary);
		font-weight: var(--weight-medium);
	}

	.line {
		fill: none;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.line.reference {
		stroke: var(--chart-reference);
		stroke-width: 1;
	}

	.dot {
		stroke-width: 2;
	}

	.crosshair {
		stroke: var(--text-secondary);
		stroke-width: 1;
	}

	.focus-dot {
		stroke: var(--chart-surface);
		stroke-width: 2;
	}

	.tooltip {
		position: absolute;
		inset-block-start: var(--space-2);
		transform: translateX(var(--space-3));
		display: grid;
		gap: var(--space-1);
		min-width: 9rem;
		padding: var(--space-2) var(--space-3);
		border: var(--border-width) solid var(--border-subtle);
		border-radius: var(--radius-md);
		background: var(--surface-raised);
		font-size: var(--text-sm);
		pointer-events: none;
	}

	.tooltip.flip {
		transform: translateX(calc(-100% - var(--space-3)));
	}

	.tooltip p {
		margin: 0;
	}

	.tooltip-x {
		color: var(--text-secondary);
		font-size: var(--text-xs);
	}

	.row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.row span:last-child {
		color: var(--text-secondary);
	}

	.line-key {
		width: var(--space-3);
		height: 2px; /* ds-allow-hardcode: grosor de la clave de linea = grosor de la linea */
		border-radius: var(--radius-sm);
	}

	.dot-key {
		width: var(--space-2);
		height: var(--space-2);
		border-radius: 50%;
	}
</style>
