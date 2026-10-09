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
</script>

<nav class="steps" aria-label={i18n.t('steps.label')}>
	<p class="progress">{i18n.t('steps.progress', { current: index + 1, total: STEPS.length })}</p>
	<ol>
		{#each STEPS as step, i (step.id)}
			<li>
				{#if step.ready}
					<a
						href={hrefFor(step.id)}
						class="step"
						class:current={step.id === current}
						aria-current={step.id === current ? 'step' : undefined}
					>
						<span class="number" aria-hidden="true">
							{#if completed.has(step.id) && step.id !== current}<Check size={14} />{:else}{i + 1}{/if}
						</span>
						<span class="label">{i18n.t(step.label)}</span>
					</a>
				{:else}
					<span class="step unavailable" aria-disabled="true">
						<span class="number" aria-hidden="true">{i + 1}</span>
						<span class="label">
							{i18n.t(step.label)}
							<span class="soon">{i18n.t('common.soon')}</span>
						</span>
					</span>
				{/if}
			</li>
		{/each}
	</ol>
</nav>

<style>
	.steps {
		display: grid;
		gap: var(--space-2);
	}

	.progress {
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

	a.step:hover {
		background: var(--surface-sunken);
		color: var(--text-primary);
	}

	.step.current {
		background: var(--surface-raised);
		box-shadow: 0 0 0 var(--border-width) var(--border-control);
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

	.unavailable {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.label {
		display: grid;
	}

	.soon {
		font-size: var(--text-xs);
		font-weight: var(--weight-regular);
	}

	@media (min-width: 64rem) {
		.progress {
			display: none;
		}

		ol {
			flex-direction: column;
			flex-wrap: nowrap;
		}
	}
</style>
