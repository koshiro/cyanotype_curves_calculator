<script lang="ts" generics="T extends string | number">
	import type { Snippet } from 'svelte';

	interface Option {
		value: T;
		label: string;
		/** Texto solo para lectores de pantalla cuando el boton muestra un icono. */
		hiddenLabel?: boolean;
		icon?: Snippet;
	}

	interface Props {
		name: string;
		legend: string;
		/** Oculta la leyenda visualmente (sigue disponible para lectores de pantalla). */
		hideLegend?: boolean;
		options: readonly Option[];
		value: T;
		onchange?: (value: T) => void;
		disabled?: boolean;
	}

	let {
		name,
		legend,
		hideLegend = false,
		options,
		value = $bindable(),
		onchange,
		disabled = false
	}: Props = $props();
</script>

<fieldset class="segmented" {disabled}>
	<legend class:visually-hidden={hideLegend}>{legend}</legend>
	<div class="options">
		{#each options as option (option.value)}
			<label class="option" title={option.hiddenLabel ? option.label : undefined}>
				<input
					type="radio"
					{name}
					value={option.value}
					checked={option.value === value}
					onchange={() => {
						value = option.value;
						onchange?.(option.value);
					}}
				/>
				{#if option.icon}{@render option.icon()}{/if}
				<span class:visually-hidden={option.hiddenLabel}>{option.label}</span>
			</label>
		{/each}
	</div>
</fieldset>

<style>
	.segmented {
		margin: 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}

	legend {
		margin-block-end: var(--space-1);
		padding: 0;
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
	}

	.options {
		display: inline-flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		padding: var(--space-1);
		border: var(--border-width) solid var(--border-control);
		border-radius: var(--radius-md);
		background: var(--surface-sunken);
	}

	.option {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: calc(var(--control-height) - var(--space-2));
		min-width: var(--target-min);
		justify-content: center;
		padding-inline: var(--space-3);
		border-radius: var(--radius-sm);
		color: var(--text-secondary);
		font-size: var(--text-sm);
		cursor: pointer;
		transition:
			background-color var(--duration-fast) var(--ease-standard),
			color var(--duration-fast) var(--ease-standard);
	}

	.option:hover {
		color: var(--text-primary);
	}

	.option:has(input:checked) {
		background: var(--surface-raised);
		color: var(--text-primary);
		font-weight: var(--weight-medium);
		box-shadow: 0 0 0 var(--border-width) var(--border-control);
	}

	.option:has(input:focus-visible) {
		outline: var(--focus-width) solid var(--focus-ring);
		outline-offset: var(--focus-offset);
	}

	input {
		position: absolute;
		opacity: 0;
		inset: 0;
		margin: 0;
		cursor: inherit;
	}

	fieldset:disabled .option {
		cursor: not-allowed;
		opacity: 0.55;
	}
</style>
