<script lang="ts">
	import { Monitor, Moon, Sun } from '@lucide/svelte';
	import { i18n, type Locale } from '$lib/i18n/index.svelte';
	import { theme, type ThemeChoice } from './theme.svelte';
	import Segmented from './Segmented.svelte';
	import { homeHref } from '$lib/routes';

	const locales: { value: Locale; label: string }[] = [
		{ value: 'es', label: 'ES' },
		{ value: 'en', label: 'EN' }
	];
</script>

{#snippet sun()}<Sun size={16} aria-hidden="true" />{/snippet}
{#snippet moon()}<Moon size={16} aria-hidden="true" />{/snippet}
{#snippet monitor()}<Monitor size={16} aria-hidden="true" />{/snippet}

<header class="header">
	<a class="brand" href={homeHref()}>
		<svg class="mark" viewBox="0 0 32 32" aria-hidden="true">
			<rect width="32" height="32" rx="7" />
			<path d="M6 25c6 0 8-18 20-18" />
		</svg>
		<span>{i18n.t('app.name')}</span>
	</a>
	<div class="controls">
		<Segmented
			name="locale"
			legend={i18n.t('settings.language')}
			hideLegend
			options={locales}
			value={i18n.locale}
			onchange={(value) => i18n.setLocale(value)}
		/>
		<Segmented
			name="theme"
			legend={i18n.t('settings.theme')}
			hideLegend
			options={[
				{
					value: 'system' as ThemeChoice,
					label: i18n.t('settings.theme.system'),
					hiddenLabel: true,
					icon: monitor
				},
				{
					value: 'light' as ThemeChoice,
					label: i18n.t('settings.theme.light'),
					hiddenLabel: true,
					icon: sun
				},
				{ value: 'dark' as ThemeChoice, label: i18n.t('settings.theme.dark'), hiddenLabel: true, icon: moon }
			]}
			value={theme.choice}
			onchange={(value) => theme.set(value)}
		/>
	</div>
</header>

<style>
	.header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border-block-end: var(--border-width) solid var(--border-subtle);
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--target-min);
		color: var(--text-primary);
		font-weight: var(--weight-semibold);
		text-decoration: none;
	}

	.mark {
		width: var(--space-6);
		height: var(--space-6);
	}

	.mark rect {
		fill: var(--action-primary);
	}

	.mark path {
		fill: none;
		stroke: var(--action-primary-text);
		stroke-width: 3;
		stroke-linecap: round;
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	@media (min-width: 48rem) {
		.header {
			padding-inline: var(--space-8);
		}
	}
</style>
