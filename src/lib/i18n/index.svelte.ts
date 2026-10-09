/**
 * Idioma de la interfaz: es o en. Se detecta del navegador la primera vez y se recuerda en
 * localStorage (si el navegador lo permite).
 */
import { en } from './en';
import { es, type MessageKey } from './es';

export type Locale = 'es' | 'en';
export const LOCALES: readonly Locale[] = ['es', 'en'];
const STORAGE_KEY = 'cyano-curve.locale';
const catalogs = { es, en } as const;

function initialLocale(): Locale {
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved === 'es' || saved === 'en') return saved;
	} catch {
		// Almacenamiento bloqueado: se usa el idioma del navegador.
	}
	const preferred = typeof navigator === 'undefined' ? 'es' : navigator.language.toLowerCase();
	return preferred.startsWith('es') ? 'es' : 'en';
}

class I18n {
	locale = $state<Locale>(initialLocale());

	setLocale(locale: Locale): void {
		this.locale = locale;
		try {
			localStorage.setItem(STORAGE_KEY, locale);
		} catch {
			// Sin persistencia: el cambio vale para esta pestana.
		}
		if (typeof document !== 'undefined') document.documentElement.lang = locale;
	}

	t = (key: MessageKey, params: Record<string, string | number> = {}): string => {
		const template: string = catalogs[this.locale][key];
		return template.replace(/\{(\w+)\}/g, (_, name: string) =>
			name in params ? this.format(params[name]!) : `{${name}}`
		);
	};

	format(value: string | number): string {
		return typeof value === 'number' ? new Intl.NumberFormat(this.locale).format(value) : value;
	}

	date(iso: string): string {
		return new Intl.DateTimeFormat(this.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
			new Date(iso)
		);
	}
}

export const i18n = new I18n();
export type { MessageKey };
