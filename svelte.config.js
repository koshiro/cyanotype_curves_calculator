import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	compilerOptions: {
		runes: true
	},
	kit: {
		// Sitio 100 % estatico: nginx en pibot sirve `build/` y cae a index.html (SPA).
		adapter: adapter({ fallback: 'index.html', strict: true }),
		version: { name: process.env.npm_package_version }
	}
};

export default config;
