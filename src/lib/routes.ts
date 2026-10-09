/** Enlaces internos pasados por resolve(): siguen funcionando si la app se sirve bajo una ruta base. */
import { resolve } from '$app/paths';
import type { StepId } from './steps/steps';

export const homeHref = (): string => resolve('/');

export const projectHref = (id: string, step?: StepId): string =>
	resolve('/p/[id]', { id }) + (step ? `?step=${step}` : '');
