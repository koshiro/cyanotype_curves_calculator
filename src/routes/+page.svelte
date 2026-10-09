<script lang="ts">
	import { goto } from '$app/navigation';
	import { ChevronRight, Plus, Trash } from '@lucide/svelte';
	import { i18n } from '$lib/i18n/index.svelte';
	import { projects } from '$lib/project/store.svelte';
	import type { Project } from '$lib/project/types';
	import Button from '$lib/ui/Button.svelte';
	import ConfirmDialog from '$lib/ui/ConfirmDialog.svelte';
	import Notice from '$lib/ui/Notice.svelte';
	import { projectHref } from '$lib/routes';

	let creating = $state(false);
	let pendingDelete = $state<Project | null>(null);
	let confirmOpen = $state(false);

	async function createProject() {
		creating = true;
		try {
			const project = await projects.create();
			await goto(projectHref(project.id));
		} finally {
			creating = false;
		}
	}

	function askDelete(project: Project) {
		pendingDelete = project;
		confirmOpen = true;
	}

	function title(project: Project): string {
		return project.name.trim() || i18n.t('projects.untitled');
	}

	function summary(project: Project): string {
		const { paper, chemistry, printer } = project.process;
		return [paper, chemistry, printer].filter((v) => v.trim()).join(' · ');
	}
</script>

{#snippet plus()}<Plus size={18} aria-hidden="true" />{/snippet}

<div class="page">
	<section class="intro">
		<h1>{i18n.t('projects.title')}</h1>
		<p class="lead">{i18n.t('projects.lead')}</p>
		<Button variant="primary" icon={plus} loading={creating} onclick={createProject}
			>{i18n.t('projects.new')}</Button
		>
	</section>

	{#if !projects.persistent}
		<Notice tone="warning">{i18n.t('projects.storage.unavailable')}</Notice>
	{/if}

	{#if projects.ready && projects.list.length === 0}
		<section class="empty">
			<h2>{i18n.t('projects.empty.title')}</h2>
			<p>{i18n.t('projects.empty.body')}</p>
		</section>
	{:else if projects.list.length > 0}
		<ul class="list" aria-label={i18n.t('projects.title')}>
			{#each projects.list as project (project.id)}
				<li class="row">
					<a
						class="open"
						href={projectHref(project.id)}
						aria-label={i18n.t('projects.open', { name: title(project) })}
					>
						<span class="name">{title(project)}</span>
						{#if summary(project)}<span class="meta">{summary(project)}</span>{/if}
						<span class="meta">
							{i18n.t('projects.updated', { date: i18n.date(project.updatedAt) })}
							·
							{project.rounds.length === 1
								? i18n.t('projects.rounds.one')
								: i18n.t('projects.rounds', { count: project.rounds.length })}
						</span>
						<ChevronRight class="chevron" size={20} aria-hidden="true" />
					</a>
					<button class="delete" type="button" onclick={() => askDelete(project)}>
						<Trash size={18} aria-hidden="true" />
						<span class="visually-hidden">{i18n.t('projects.delete')} {title(project)}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

{#if pendingDelete}
	<ConfirmDialog
		bind:open={confirmOpen}
		title={i18n.t('projects.delete.title', { name: title(pendingDelete) })}
		body={i18n.t('projects.delete.body')}
		confirmLabel={i18n.t('projects.delete.confirm')}
		onconfirm={() => projects.remove(pendingDelete!.id)}
	/>
{/if}

<style>
	.page {
		display: grid;
		gap: var(--space-8);
		max-width: 60rem;
		padding: var(--space-8) var(--space-4) var(--space-16);
	}

	.intro {
		display: grid;
		justify-items: start;
		gap: var(--space-4);
	}

	h1 {
		margin: 0;
		font-size: var(--text-4xl);
		font-weight: var(--weight-semibold);
		letter-spacing: -0.02em;
	}

	.lead {
		max-width: 52ch;
		margin: 0;
		color: var(--text-secondary);
		font-size: var(--text-lg);
	}

	.empty {
		padding: var(--space-8) var(--space-6);
		border: var(--border-width) dashed var(--border-control);
		border-radius: var(--radius-lg);
	}

	.empty h2 {
		margin: 0 0 var(--space-2);
		font-size: var(--text-xl);
	}

	.empty p {
		margin: 0;
		color: var(--text-secondary);
	}

	.list {
		display: grid;
		margin: 0;
		padding: 0;
		border-block-start: var(--border-width) solid var(--border-subtle);
		list-style: none;
	}

	.row {
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: center;
		border-block-end: var(--border-width) solid var(--border-subtle);
	}

	.open {
		position: relative;
		display: grid;
		gap: var(--space-1);
		padding: var(--space-4) var(--space-8) var(--space-4) var(--space-2);
		border-radius: var(--radius-md);
		color: var(--text-primary);
		text-decoration: none;
		transition: background-color var(--duration-fast) var(--ease-standard);
	}

	.open:hover {
		background: var(--surface-sunken);
	}

	.name {
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
	}

	.meta {
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	.open :global(.chevron) {
		position: absolute;
		inset-inline-end: var(--space-2);
		inset-block-start: 50%;
		translate: 0 -50%;
		color: var(--text-secondary);
	}

	.delete {
		display: inline-grid;
		place-items: center;
		min-width: var(--control-height);
		min-height: var(--control-height);
		margin-inline-start: var(--space-2);
		border: var(--border-width) solid transparent;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--text-secondary);
		cursor: pointer;
		transition:
			color var(--duration-fast) var(--ease-standard),
			background-color var(--duration-fast) var(--ease-standard);
	}

	.delete:hover {
		background: var(--surface-sunken);
		color: var(--action-destructive);
	}

	.delete:active {
		transform: translateY(1px);
	}

	@media (min-width: 48rem) {
		.page {
			padding: var(--space-16) var(--space-8) var(--space-24);
		}

		h1 {
			font-size: var(--text-5xl);
		}
	}
</style>
