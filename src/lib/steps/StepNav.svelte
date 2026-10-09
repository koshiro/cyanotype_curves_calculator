<script lang="ts">
	import { Check } from '@lucide/svelte';
	import { i18n } from '$lib/i18n/index.svelte';
	import { STEPS, type StepId } from './steps';

	interface Props {
		current: StepId;
		completed: ReadonlySet<StepId>;
		hrefFor: (step: StepId) => string;
	}

	let { current, completed, hrefFor }: Props = $props();
	const index = $derived(STEPS.findIndex((s) => s.id === current));
	const ready = STEPS.filter((s) => s.ready);
	const upcoming = $derived(
		STEPS.filter((s) => !s.ready)
			.map((s) => i18n.t(s.label))
			.join(', ')
	);
</script>

<nav class="steps" aria-label={i18n.t('steps.label')}>
	<p class="progress">{i18n.t('steps.progress', { current: index + 1, total: STEPS.length })}</p>
	<ol>
		{#each ready as step (step.id)}
			{@const number = STEPS.indexOf(step) + 1}
			<li>
				<a
					href={hrefFor(step.id)}
					class="step"
					class:current={step.id === current}
					aria-current={step.id === current ? 'step' : undefined}
				>
					<span class="number" aria-hidden="true">
						{#if completed.has(step.id) && step.id !== current}<Check size={14} />{:else}{number}{/if}
					</span>
					<span>{i18n.t(step.label)}</span>
				</a>
			</li>
		{/each}
	</ol>
	{#if upcoming}<p class="upcoming">{i18n.t('steps.upcoming', { steps: upcoming })}</p>{/if}
</nav>

<style>
	.steps {
		display: grid;
		gap: var(--space-2);
	}

	.progress,
	.upcoming {
		margin: 0;
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	ol {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.step {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--control-height);
		padding: var(--space-1) var(--space-3) var(--space-1) var(--space-1);
		border-radius: var(--radius-md);
		color: var(--text-secondary);
		font-size: var(--text-sm);
		text-decoration: none;
		transition: background-color var(--duration-fast) var(--ease-standard);
	}

	.step:hover {
		background: var(--surface-sunken);
		color: var(--text-primary);
	}

	.step.current {
		background: var(--surface-sunken);
		color: var(--text-primary);
		font-weight: var(--weight-semibold);
	}

	.number {
		display: inline-grid;
		place-items: center;
		width: var(--space-6);
		height: var(--space-6);
		border: var(--border-width) solid var(--border-control);
		border-radius: 50%;
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}

	.current .number {
		border-color: var(--action-primary);
		background: var(--action-primary);
		color: var(--action-primary-text);
	}

	@media (min-width: 64rem) {
		ol {
			flex-direction: column;
			flex-wrap: nowrap;
		}
	}
</style>
