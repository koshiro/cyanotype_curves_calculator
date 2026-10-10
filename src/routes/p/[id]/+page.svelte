<script lang="ts">
	import { beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { ArrowLeft } from '@lucide/svelte';
	import { i18n } from '$lib/i18n/index.svelte';
	import { projects } from '$lib/project/store.svelte';
	import { discardOnLeave } from '$lib/project/discard';
	import type { Project } from '$lib/project/types';
	import ProjectStep from '$lib/steps/ProjectStep.svelte';
	import StepNav from '$lib/steps/StepNav.svelte';
	import TargetStep from '$lib/steps/TargetStep.svelte';
	import ScanStep from '$lib/steps/ScanStep.svelte';
	import CurveStep from '$lib/steps/CurveStep.svelte';
	import ExportStep from '$lib/steps/ExportStep.svelte';
	import PhotoStep from '$lib/steps/PhotoStep.svelte';
	import { isStepId, type StepId } from '$lib/steps/steps';
	import { homeHref, projectHref } from '$lib/routes';

	let project = $state<Project | null>(null);
	let missing = $state(false);
	let saved = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	const id = $derived(page.params.id ?? '');
	const stepParam = $derived(page.url.searchParams.get('step'));
	const step = $derived<StepId>(isStepId(stepParam) ? stepParam : 'project');
	const completed = $derived(
		new Set<StepId>([
			...(project && project.name.trim() ? (['project'] as StepId[]) : []),
			...(project && project.rounds.length > 0 ? (['target'] as StepId[]) : []),
			// Escaneo completo solo si hay alguno sin errores (uno equivocado no cuenta).
			...(project &&
			project.rounds.some((r) => r.scan && !r.scan.diagnostics.some((d) => d.severity === 'error'))
				? (['scan'] as StepId[])
				: []),
			// Con mediciones la curva queda calculada (con el metodo recomendado si no se eligio otro).
			...(project &&
			project.rounds.some((r) => r.scan && !r.scan.diagnostics.some((d) => d.severity === 'error'))
				? (['curve'] as StepId[])
				: [])
		])
	);

	$effect(() => {
		const current = id;
		missing = false;
		project = null;
		void projects.get(current).then((found) => {
			if (current !== id) return;
			if (found) project = found;
			else missing = true;
		});
	});

	async function save() {
		if (!project) return;
		await projects.save(project);
		saved = true;
	}

	function scheduleSave() {
		saved = false;
		clearTimeout(timer);
		timer = setTimeout(() => void save(), 500);
	}

	const hrefFor = (target: StepId) => projectHref(id, target);

	/** Un proyecto recien creado y sin tocar se descarta al volver a la lista; al recargar se conserva. */
	beforeNavigate(({ type, to }) => {
		if (project && discardOnLeave(project, id, { type, toPath: to?.url.pathname ?? null }))
			void projects.remove(project.id);
	});
</script>

<div class="workspace">
	<a class="back" href={homeHref()}><ArrowLeft size={16} aria-hidden="true" /> {i18n.t('common.back')}</a>

	{#if missing}
		<section class="missing">
			<h1>{i18n.t('notfound.title')}</h1>
			<p>{i18n.t('notfound.body')}</p>
		</section>
	{:else if project}
		<div class="frame">
			<aside class="rail">
				<StepNav current={step} {completed} {hrefFor} />
			</aside>
			<div class="content">
				<p class="eyebrow">{project.name.trim() || i18n.t('projects.untitled')}</p>
				{#if step === 'project'}
					<ProjectStep bind:project onchange={scheduleSave} {saved} nextHref={hrefFor('target')} />
				{:else if step === 'target'}
					<TargetStep bind:project onsave={save} />
				{:else if step === 'scan'}
					<ScanStep bind:project onsave={save} targetHref={hrefFor('target')} curveHref={hrefFor('curve')} />
				{:else if step === 'curve'}
					<CurveStep bind:project onsave={save} scanHref={hrefFor('scan')} exportHref={hrefFor('export')} />
				{:else if step === 'export'}
					<ExportStep {project} curveHref={hrefFor('curve')} photoHref={hrefFor('photo')} />
				{:else if step === 'photo'}
					<PhotoStep {project} curveHref={hrefFor('curve')} />
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.workspace {
		display: grid;
		gap: var(--space-4);
		padding: var(--space-4) var(--space-4) var(--space-16);
	}

	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		justify-self: start;
		min-height: var(--target-min);
		color: var(--text-secondary);
		font-size: var(--text-sm);
		text-decoration: none;
	}

	.back:hover {
		color: var(--text-primary);
	}

	.frame {
		display: grid;
		gap: var(--space-8);
	}

	.rail {
		display: grid;
		gap: var(--space-3);
		align-content: start;
	}

	.content {
		display: grid;
		gap: var(--space-2);
		align-content: start;
		min-width: 0;
	}

	/* El proyecto es el contexto del paso: va sobre el titulo, en tono secundario. */
	.eyebrow {
		margin: 0;
		color: var(--text-secondary);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		overflow-wrap: anywhere;
	}

	.missing h1 {
		margin: 0 0 var(--space-2);
		font-size: var(--screen-title);
	}

	.missing p {
		margin: 0;
		color: var(--text-secondary);
	}

	@media (min-width: 48rem) {
		.workspace {
			padding-inline: var(--space-8);
		}
	}

	@media (min-width: 64rem) {
		.frame {
			grid-template-columns: 14rem minmax(0, 1fr);
			gap: var(--space-12);
		}

		.rail {
			position: sticky;
			inset-block-start: var(--space-6);
		}
	}
</style>
