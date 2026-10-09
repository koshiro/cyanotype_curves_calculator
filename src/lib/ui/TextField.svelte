<script lang="ts">
	interface Props {
		id: string;
		label: string;
		value: string | number;
		type?: 'text' | 'number';
		placeholder?: string;
		hint?: string;
		error?: string;
		optionalLabel?: string;
		multiline?: boolean;
		min?: number;
		max?: number;
		step?: number;
		disabled?: boolean;
		oninput?: () => void;
	}

	let {
		id,
		label,
		value = $bindable(),
		type = 'text',
		placeholder,
		hint,
		error,
		optionalLabel,
		multiline = false,
		min,
		max,
		step,
		disabled = false,
		oninput
	}: Props = $props();

	const describedBy = $derived(
		[hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined
	);
</script>

<div class="field" class:invalid={Boolean(error)}>
	<label for={id}>
		{label}
		{#if optionalLabel}<span class="optional">({optionalLabel})</span>{/if}
	</label>
	{#if multiline}
		<textarea
			{id}
			bind:value
			rows="3"
			{placeholder}
			{disabled}
			aria-describedby={describedBy}
			aria-invalid={Boolean(error)}
			{oninput}></textarea>
	{:else}
		<input
			{id}
			{type}
			bind:value
			{placeholder}
			{min}
			{max}
			{step}
			{disabled}
			inputmode={type === 'number' ? 'decimal' : undefined}
			aria-describedby={describedBy}
			aria-invalid={Boolean(error)}
			{oninput}
		/>
	{/if}
	{#if hint}<p class="hint" id="{id}-hint">{hint}</p>{/if}
	{#if error}<p class="error" id="{id}-error">{error}</p>{/if}
</div>

<style>
	.field {
		display: grid;
		gap: var(--space-1);
	}

	label {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
	}

	.optional {
		margin-inline-start: var(--space-1);
		color: var(--text-secondary);
		font-weight: var(--weight-regular);
	}

	input,
	textarea {
		width: 100%;
		min-height: var(--control-height);
		padding: var(--space-2) var(--space-3);
		border: var(--border-width) solid var(--border-control);
		border-radius: var(--radius-md);
		background: var(--surface-raised);
		color: var(--text-primary);
		font: inherit;
		transition: border-color var(--duration-fast) var(--ease-standard);
	}

	textarea {
		resize: vertical;
	}

	input:hover:not(:disabled),
	textarea:hover:not(:disabled) {
		border-color: var(--text-secondary);
	}

	input:focus-visible,
	textarea:focus-visible {
		outline: var(--focus-width) solid var(--focus-ring);
		outline-offset: 0;
		border-color: var(--focus-ring);
	}

	input:disabled,
	textarea:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	.invalid input,
	.invalid textarea {
		border-color: var(--feedback-danger);
	}

	.hint,
	.error {
		margin: 0;
		font-size: var(--text-sm);
	}

	.hint {
		color: var(--text-secondary);
	}

	.error {
		color: var(--feedback-danger);
	}
</style>
