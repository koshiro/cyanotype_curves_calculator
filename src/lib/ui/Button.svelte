<script lang="ts">
	import { LoaderCircle } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';

	interface Props extends HTMLButtonAttributes {
		variant?: Variant;
		href?: string;
		download?: string;
		loading?: boolean;
		icon?: Snippet;
		children?: Snippet;
	}

	let {
		variant = 'secondary',
		href,
		download,
		loading = false,
		disabled = false,
		type = 'button',
		icon,
		children,
		...rest
	}: Props = $props();
</script>

{#if href && !disabled}
	<a class="button {variant}" {href} {download}>
		{#if icon}{@render icon()}{/if}
		{#if children}<span>{@render children()}</span>{/if}
	</a>
{:else}
	<button
		class="button {variant}"
		{type}
		disabled={disabled || loading}
		aria-busy={loading || undefined}
		{...rest}
	>
		{#if loading}
			<LoaderCircle class="spin" size={18} aria-hidden="true" />
		{:else if icon}
			{@render icon()}
		{/if}
		{#if children}<span>{@render children()}</span>{/if}
	</button>
{/if}

<style>
	.button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		min-height: var(--control-height);
		min-width: var(--target-min);
		padding-inline: var(--space-4);
		border: var(--border-width) solid transparent;
		border-radius: var(--radius-md);
		font: inherit;
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		line-height: var(--leading-tight);
		text-decoration: none;
		cursor: pointer;
		transition:
			background-color var(--duration-fast) var(--ease-standard),
			border-color var(--duration-fast) var(--ease-standard),
			transform var(--duration-fast) var(--ease-standard);
	}

	.button:active:not(:disabled) {
		transform: translateY(1px);
	}

	.button:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	.primary {
		background: var(--action-primary);
		color: var(--action-primary-text);
	}
	.primary:hover:not(:disabled) {
		background: var(--action-primary-hover);
	}

	.secondary {
		background: var(--surface-raised);
		border-color: var(--border-control);
		color: var(--text-primary);
	}
	.secondary:hover:not(:disabled) {
		background: var(--surface-sunken);
	}

	.ghost {
		background: transparent;
		color: var(--text-primary);
	}
	.ghost:hover:not(:disabled) {
		background: var(--surface-sunken);
	}

	.destructive {
		background: var(--action-destructive);
		color: var(--action-destructive-text);
	}
	.destructive:hover:not(:disabled) {
		filter: brightness(1.08);
	}

	:global(.spin) {
		animation: spin var(--duration-slow) linear infinite;
		animation-duration: 900ms; /* ds-allow-hardcode: rotacion continua del indicador */
	}

	@keyframes spin {
		to {
			transform: rotate(1turn);
		}
	}
</style>
