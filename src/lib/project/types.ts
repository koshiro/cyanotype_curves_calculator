/**
 * Proyecto de calibracion: lo que define el proceso y sus rondas (target + escaneo).
 * Se guarda en IndexedDB y se exporta como JSON versionado.
 */
import type { MeasuredPatch } from '../core/curve/types';
import type { TargetLayout, TargetOptions } from '../core/target/layout';

export const PROJECT_SCHEMA = 'cyano-curve/project';
export const PROJECT_VERSION = 1;

export interface ProcessInfo {
	paper: string;
	chemistry: string;
	printer: string;
	film: string;
	exposure: string;
	notes: string;
}

export interface ScanRecord {
	fileName: string;
	analyzedAt: string;
	width: number;
	height: number;
	bitDepth: number;
	patches: MeasuredPatch[];
}

export interface Round {
	id: string;
	createdAt: string;
	targetOptions: TargetOptions;
	layout: TargetLayout;
	scan?: ScanRecord;
}

export interface Project {
	schema: typeof PROJECT_SCHEMA;
	version: typeof PROJECT_VERSION;
	id: string;
	name: string;
	createdAt: string;
	updatedAt: string;
	process: ProcessInfo;
	rounds: Round[];
}

export const EMPTY_PROCESS: ProcessInfo = {
	paper: '',
	chemistry: '',
	printer: '',
	film: '',
	exposure: '',
	notes: ''
};

export function newId(): string {
	return typeof crypto !== 'undefined' && 'randomUUID' in crypto
		? crypto.randomUUID()
		: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createProject(name = ''): Project {
	const now = new Date().toISOString();
	return {
		schema: PROJECT_SCHEMA,
		version: PROJECT_VERSION,
		id: newId(),
		name,
		createdAt: now,
		updatedAt: now,
		process: { ...EMPTY_PROCESS },
		rounds: []
	};
}
