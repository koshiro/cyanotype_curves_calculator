<script lang="ts">
	import { i18n } from '$lib/i18n/index.svelte';
	import type { Project } from '$lib/project/types';
	import Button from '$lib/ui/Button.svelte';
	import TextField from '$lib/ui/TextField.svelte';

	interface Props {
		project: Project;
		onchange: () => void;
		saved: boolean;
		nextHref: string;
	}

	let { project = $bindable(), onchange, saved, nextHref }: Props = $props();
	const optional = $derived(i18n.t('common.optional'));
</script>

<section class="step" aria-labelledby="project-title">
	<header>
		<h1 id="project-title">{i18n.t('project.title')}</h1>
		<p class="lead">{i18n.t('project.lead')}</p>
	</header>

	<div class="form">
		<div class="wide">
			<TextField
				id="name"
				label={i18n.t('project.name')}
				placeholder={i18n.t('project.name.placeholder')}
				bind:value={project.name}
				oninput={onchange}
			/>
		</div>
		<TextField
			id="paper"
			label={i18n.t('project.paper')}
			optionalLabel={optional}
			bind:value={project.process.paper}
			oninput={onchange}
		/>
		<TextField
			id="chemistry"
			label={i18n.t('project.chemistry')}
			placeholder={i18n.t('project.chemistry.placeholder')}
			optionalLabel={optional}
			bind:value={project.process.chemistry}
			oninput={onchange}
		/>
		<TextField
			id="printer"
			label={i18n.t('project.printer')}
			optionalLabel={optional}
			bind:value={project.process.printer}
			oninput={onchange}
		/>
		<TextField
			id="film"
			label={i18n.t('project.film')}
			optionalLabel={optional}
			bind:value={project.process.film}
			oninput={onchange}
		/>
		<TextField
			id="exposure"
			label={i18n.t('project.exposure')}
			placeholder={i18n.t('project.exposure.placeholder')}
			optionalLabel={optional}
			bind:value={project.process.exposure}
			oninput={onchange}
		/>
		<div class="wide">
			<TextField
				id="notes"
				label={i18n.t('project.notes')}
				optionalLabel={optional}
				multiline
				bind:value={project.process.notes}
				oninput={onchange}
			/>
		</div>
	</div>

	<footer>
		<Button variant="primary" href={nextHref}>{i18n.t('project.next')}</Button>
		<p class="saved" aria-live="polite">{saved ? i18n.t('common.saved') : ''}</p>
	</footer>
</section>

<style>
	.step {
		display: grid;
		gap: var(--space-8);
	}

	h1 {
		margin: 0 0 var(--space-2);
		font-size: var(--text-3xl);
	}

	.lead {
		max-width: 56ch;
		margin: 0;
		color: var(--text-secondary);
	}

	.form {
		display: grid;
		gap: var(--space-4);
		max-width: 44rem;
	}

	footer {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-4);
	}

	.saved {
		margin: 0;
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	@media (min-width: 40rem) {
		.form {
			grid-template-columns: 1fr 1fr;
		}

		.wide {
			grid-column: 1 / -1;
		}
	}

	@media (min-width: 48rem) {
		h1 {
			font-size: var(--text-4xl);
		}
	}
</style>
