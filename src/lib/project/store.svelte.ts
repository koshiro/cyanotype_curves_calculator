/** Estado de proyectos compartido por la interfaz, respaldado por IndexedDB. */
import { openRepository, type ProjectRepository } from './db';
import { createProject, type Project } from './types';

class ProjectsStore {
	#repo: ProjectRepository | null = null;
	#opening: Promise<ProjectRepository> | null = null;
	ready = $state(false);
	persistent = $state(true);
	list = $state<Project[]>([]);

	async #repository(): Promise<ProjectRepository> {
		if (this.#repo) return this.#repo;
		this.#opening ??= openRepository();
		this.#repo = await this.#opening;
		this.persistent = this.#repo.persistent;
		return this.#repo;
	}

	async init(): Promise<void> {
		await this.refresh();
		this.ready = true;
	}

	async refresh(): Promise<void> {
		const repo = await this.#repository();
		this.list = (await repo.list()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	}

	async get(id: string): Promise<Project | undefined> {
		return (await this.#repository()).get(id);
	}

	async create(name = ''): Promise<Project> {
		const project = createProject(name);
		await (await this.#repository()).put(project);
		await this.refresh();
		return project;
	}

	async save(project: Project): Promise<void> {
		project.updatedAt = new Date().toISOString();
		await (await this.#repository()).put(project);
		await this.refresh();
	}

	async remove(id: string): Promise<void> {
		await (await this.#repository()).remove(id);
		await this.refresh();
	}
}

export const projects = new ProjectsStore();
