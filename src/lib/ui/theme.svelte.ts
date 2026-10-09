/** Tema claro/oscuro/sistema: se aplica con data-theme en <html> y se recuerda localmente. */
export type ThemeChoice = 'system' | 'light' | 'dark';
const STORAGE_KEY = 'cyano-curve.theme';

function initial(): ThemeChoice {
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
	} catch {
		// Sin almacenamiento: se sigue al sistema.
	}
	return 'system';
}

class Theme {
	choice = $state<ThemeChoice>(initial());

	apply(): void {
		const root = document.documentElement;
		if (this.choice === 'system') delete root.dataset.theme;
		else root.dataset.theme = this.choice;
	}

	set(choice: ThemeChoice): void {
		this.choice = choice;
		try {
			localStorage.setItem(STORAGE_KEY, choice);
		} catch {
			// Sin persistencia.
		}
		this.apply();
	}
}

export const theme = new Theme();
