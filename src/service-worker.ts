/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/**
 * Service worker: la app funciona sin conexion (en el cuarto oscuro o el taller).
 *
 * - Al instalar se guardan el shell (index.html), los archivos de la app con hash y los
 *   estaticos. Cada version usa su propia cache y al activarse borra las anteriores.
 * - Navegacion: red primero (para recibir versiones nuevas) y, sin red, el shell guardado.
 * - Recursos de la app: cache primero (llevan hash; no cambian sin cambiar de nombre).
 * Los datos del usuario viven en IndexedDB y no pasan por aqui.
 */
import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `cyano-curve-${version}`;
const SHELL = '/';
const ASSETS = [...build, ...files.filter((f) => !f.endsWith('.DS_Store'))];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			await cache.addAll([SHELL, ...ASSETS]);
			await sw.skipWaiting();
		})()
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
			await sw.clients.claim();
		})()
	);
});

sw.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== sw.location.origin) return;

	if (request.mode === 'navigate') {
		event.respondWith(
			(async () => {
				try {
					const response = await fetch(request);
					if (response.ok) (await caches.open(CACHE)).put(SHELL, response.clone());
					return response;
				} catch {
					return (await caches.match(SHELL)) ?? Response.error();
				}
			})()
		);
		return;
	}

	if (ASSETS.includes(url.pathname)) {
		event.respondWith((async () => (await caches.match(url.pathname)) ?? fetch(request))());
	}
});
