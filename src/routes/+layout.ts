// Toda la app corre en el navegador (IndexedDB, Workers, archivos locales): sin SSR ni
// prerender. adapter-static escribe un unico shell (index.html) y nginx cae a el en toda ruta.
export const ssr = false;
export const prerender = false;
