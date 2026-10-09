<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { i18n } from '$lib/i18n/index.svelte';
	import { projects } from '$lib/project/store.svelte';
	import AppHeader from '$lib/ui/AppHeader.svelte';
	import { theme } from '$lib/ui/theme.svelte';

	let { children } = $props();

	onMount(() => {
		theme.apply();
		document.documentElement.lang = i18n.locale;
		void projects.init();
	});
</script>

<svelte:head>
	<title>{i18n.t('app.name')}</title>
</svelte:head>

<a class="skip" href="#main">{i18n.t('app.skip')}</a>
<AppHeader />
<main id="main">
	{@render children()}
</main>
<footer class="footer">
	<p>{i18n.t('app.privacy')}</p>
</footer>

<style>
	.skip {
		position: absolute;
		inset-inline-start: var(--space-2);
		inset-block-start: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		background: var(--action-primary);
		color: var(--action-primary-text);
		transform: translateY(-200%);
	}

	.skip:focus-visible {
		transform: none;
	}

	main {
		min-height: 70vh;
	}

	.footer {
		padding: var(--space-6) var(--space-4);
		border-block-start: var(--border-width) solid var(--border-subtle);
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	.footer p {
		margin: 0;
	}

	@media (min-width: 48rem) {
		.footer {
			padding-inline: var(--space-8);
		}
	}
</style>
