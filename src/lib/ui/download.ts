/** Descarga un archivo generado en el navegador. */
export function downloadBytes(bytes: Uint8Array | string, fileName: string, type: string): void {
	const part: BlobPart = typeof bytes === 'string' ? bytes : (bytes.slice().buffer as ArrayBuffer);
	const url = URL.createObjectURL(new Blob([part], { type }));
	const link = document.createElement('a');
	link.href = url;
	link.download = fileName;
	document.body.append(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Nombre de archivo seguro a partir de un texto libre. */
export function slug(text: string, fallback = 'proyecto'): string {
	const base = text
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48);
	return base || fallback;
}
