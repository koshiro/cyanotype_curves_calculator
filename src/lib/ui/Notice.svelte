<script lang="ts">
	import { CircleAlert, CircleCheck, Info, TriangleAlert } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		tone?: 'info' | 'warning' | 'error' | 'success';
		title?: string;
		children: Snippet;
	}

	let { tone = 'info', title, children }: Props = $props();
	const Icon = $derived(
		{ info: Info, warning: TriangleAlert, error: CircleAlert, success: CircleCheck }[tone]
	);
</script>

<div class="notice {tone}" role={tone === 'error' ? 'alert' : 'status'}>
	<Icon class="icon" size={20} aria-hidden="true" />
	<div class="body">
		{#if title}<p class="title">{title}</p>{/if}
		<div class="text">{@render children()}</div>
	</div>
</div>

<style>
	.notice {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border: var(--border-width) solid var(--border-subtle);
		border-radius: var(--radius-md);
		background: var(--surface-raised);
	}

	.notice :global(.icon) {
		margin-block-start: var(--space-1);
	}

	.info :global(.icon) {
		color: var(--feedback-info);
	}
	.warning :global(.icon) {
		color: var(--feedback-warning);
	}
	.error :global(.icon) {
		color: var(--feedback-danger);
	}
	.success :global(.icon) {
		color: var(--feedback-success);
	}

	.title {
		margin: 0 0 var(--space-1);
		font-weight: var(--weight-semibold);
	}

	.text {
		font-size: var(--text-sm);
		color: var(--text-primary);
	}

	.text :global(p) {
		margin: 0;
	}
</style>
