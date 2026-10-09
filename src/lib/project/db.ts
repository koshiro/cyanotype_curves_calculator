/**
 * Persistencia de proyectos en IndexedDB. Si el navegador no la permite (modo privado
 * estricto, almacenamiento bloqueado), cae a memoria y lo informa con `persistent = false`.
 */
import type { Project } from './types';

const DB_NAME = 'cyano-curve';
const DB_VERSION = 1;
const STORE = 'projects';

export interface ProjectRepository {
	persistent: boolean;
	list(): Promise<Project[]>;
	get(id: string): Promise<Project | undefined>;
	put(project: Project): Promise<void>;
	remove(id: string): Promise<void>;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

async function openDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
		req.onblocked = () => reject(new Error('IndexedDB bloqueada por otra pestana'));
	});
}

function indexedRepository(db: IDBDatabase): ProjectRepository {
	const store = (mode: IDBTransactionMode) => db.transaction(STORE, mode).objectStore(STORE);
	return {
		persistent: true,
		list: () => request(store('readonly').getAll() as IDBRequest<Project[]>),
		get: (id) => request(store('readonly').get(id) as IDBRequest<Project | undefined>),
		put: async (project) => {
			// structuredClone quita los proxies de $state antes de guardar.
			await request(store('readwrite').put(plainCopy(project)));
		},
		remove: async (id) => {
			await request(store('readwrite').delete(id));
		}
	};
}

export function memoryRepository(): ProjectRepository {
	const items = new Map<string, Project>();
	return {
		persistent: false,
		list: async () => [...items.values()].map((p) => structuredClone(p)),
		get: async (id) => (items.has(id) ? structuredClone(items.get(id)!) : undefined),
		put: async (project) => {
			items.set(project.id, plainCopy(project));
		},
		remove: async (id) => {
			items.delete(id);
		}
	};
}

export async function openRepository(): Promise<ProjectRepository> {
	try {
		if (typeof indexedDB === 'undefined') return memoryRepository();
		return indexedRepository(await openDatabase());
	} catch {
		return memoryRepository();
	}
}

/** Copia plana de un valor que puede venir de $state (sin depender de Svelte en tests). */
function plainCopy<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}
