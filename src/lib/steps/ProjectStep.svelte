<script lang="ts">
	import { i18n, type MessageKey } from '$lib/i18n/index.svelte';
	import type { ProcessInfo, Project } from '$lib/project/types';
	import Button from '$lib/ui/Button.svelte';
	import TextField from '$lib/ui/TextField.svelte';

	interface Props {
		project: Project;
		onchange: () => void;
		saved: boolean;
		nextHref: string;
	}

	let { project = $bindable(), onchange, saved, nextHref }: Props = $props();

	const fields: { key: keyof ProcessInfo; label: MessageKey; placeholder: MessageKey; wide?: boolean }[] = [
		{ key: 'paper', label: 'project.paper', placeholder: 'project.paper.placeholder' },
		{ key: 'chemistry', label: 'project.chemistry', placeholder: 'project.chemistry.placeholder' },
		{ key: 'printer', label: 'project.printer', placeholder: 'project.printer.placeholder' },
		{ key: 'film', label: 'project.film', placeholder: 'project.film.placeholder' },
		{ key: 'exposure', label: 'project.exposure', placeholder: 'project.exposure.placeholder', wide: true }
	];
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
				hint={i18n.t('project.hint')}
				bind:value={project.name}
				oninput={onchange}
			/>
		</div>
		{#each fields as field (field.key)}
			<div class:wide={field.wide}>
				<TextField
					id={field.key}
					label={i18n.t(field.label)}
					placeholder={i18n.t(field.placeholder)}
					bind:value={project.process[field.key]}
					oninput={onchange}
				/>
			</div>
		{/each}
		<div class="wide">
			<TextField
				id="notes"
				label={i18n.t('project.notes')}
				placeholder={i18n.t('project.notes.placeholder')}
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
		font-size: var(--screen-title);
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
</style>
