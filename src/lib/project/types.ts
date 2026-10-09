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
	dpi?: number;
	/** Mediciones listas para calibrar (con campo plano corregido si se pidio). */
	patches: MeasuredPatch[];
	mirrored: boolean;
	rotationDegrees: number;
	flatFieldApplied: boolean;
	/** Diferencia de L* entre extremos por exposicion despareja, si fue significativa. */
	unevenExposureL: number | null;
	diagnostics: { code: string; severity: string; params?: Record<string, number | string> }[];
	/** Miniatura JPEG (data URL) y superposiciones en sus coordenadas, para volver a mostrarla. */
	preview: { dataUrl: string; width: number; height: number };
	overlays: { value: number; corners: [number, number][]; outlier: boolean }[];
	markers: [number, number][][];
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
