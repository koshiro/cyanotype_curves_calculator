<script lang="ts">
	import { Languages, Monitor, Moon, Sun } from '@lucide/svelte';
	import { i18n } from '$lib/i18n/index.svelte';
	import { homeHref } from '$lib/routes';
	import { theme, type ThemeChoice } from './theme.svelte';

	const NEXT_THEME: Record<ThemeChoice, ThemeChoice> = { system: 'light', light: 'dark', dark: 'system' };
	const ThemeIcon = $derived({ system: Monitor, light: Sun, dark: Moon }[theme.choice]);
	const themeName = $derived(i18n.t(`settings.theme.${theme.choice}` as 'settings.theme.system'));
</script>

<header class="header">
	<a class="brand" href={homeHref()}>
		<svg class="mark" viewBox="0 0 32 32" aria-hidden="true">
			<rect width="32" height="32" rx="7" />
			<path d="M6 25c6 0 8-18 20-18" />
		</svg>
		<span>{i18n.t('app.name')}</span>
	</a>
	<div class="controls">
		<button
			class="control"
			type="button"
			aria-label={i18n.t('settings.language.label')}
			lang={i18n.locale === 'es' ? 'en' : 'es'}
			onclick={() => i18n.setLocale(i18n.locale === 'es' ? 'en' : 'es')}
		>
			<Languages size={18} aria-hidden="true" />
			<span class="wide-only">{i18n.t('settings.language.switch')}</span>
		</button>
		<button
			class="control"
			type="button"
			aria-label={i18n.t('settings.theme.label', { theme: themeName })}
			title={i18n.t('settings.theme.label', { theme: themeName })}
			onclick={() => theme.set(NEXT_THEME[theme.choice])}
		>
			<ThemeIcon size={18} aria-hidden="true" />
		</button>
	</div>
</header>

<style>
	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-4);
		border-block-end: var(--border-width) solid var(--border-subtle);
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--control-height);
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
		gap: var(--space-1);
	}

	.control {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-width: var(--control-height);
		min-height: var(--control-height);
		justify-content: center;
		padding-inline: var(--space-2);
		border: var(--border-width) solid transparent;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--text-secondary);
		font: inherit;
		font-size: var(--text-sm);
		cursor: pointer;
		transition:
			background-color var(--duration-fast) var(--ease-standard),
			color var(--duration-fast) var(--ease-standard);
	}

	.control:hover {
		background: var(--surface-sunken);
		color: var(--text-primary);
	}

	.control:active {
		transform: translateY(1px);
	}

	.wide-only {
		display: none;
	}

	@media (min-width: 40rem) {
		.wide-only {
			display: inline;
		}
	}

	@media (min-width: 48rem) {
		.header {
			padding-inline: var(--space-8);
		}
	}
</style>
