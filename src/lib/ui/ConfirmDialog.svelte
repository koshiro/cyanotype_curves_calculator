<script lang="ts">
	import Button from './Button.svelte';
	import { i18n } from '$lib/i18n/index.svelte';

	interface Props {
		open: boolean;
		title: string;
		body: string;
		confirmLabel: string;
		onconfirm: () => void | Promise<void>;
	}

	let { open = $bindable(), title, body, confirmLabel, onconfirm }: Props = $props();
	let dialog: HTMLDialogElement | undefined = $state();
	let busy = $state(false);

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	});

	async function confirm() {
		busy = true;
		try {
			await onconfirm();
			open = false;
		} finally {
			busy = false;
		}
	}
</script>

<dialog bind:this={dialog} aria-labelledby="confirm-title" onclose={() => (open = false)}>
	<h2 id="confirm-title">{title}</h2>
	<p>{body}</p>
	<div class="actions">
		<Button variant="secondary" onclick={() => (open = false)}>{i18n.t('common.cancel')}</Button>
		<Button variant="destructive" loading={busy} onclick={confirm}>{confirmLabel}</Button>
	</div>
</dialog>

<style>
	dialog {
		width: min(28rem, calc(100vw - var(--space-8)));
		padding: var(--space-6);
		border: var(--border-width) solid var(--border-subtle);
		border-radius: var(--radius-lg);
		background: var(--surface-raised);
		color: var(--text-primary);
	}

	dialog::backdrop {
		background: var(--scrim);
	}

	h2 {
		margin: 0 0 var(--space-2);
		font-size: var(--text-xl);
		line-height: var(--leading-tight);
	}

	p {
		margin: 0 0 var(--space-6);
		color: var(--text-secondary);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--space-2);
	}
</style>
