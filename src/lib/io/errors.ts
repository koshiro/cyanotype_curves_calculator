export type ImageFormatErrorCode =
	'UNSUPPORTED_FORMAT' | 'UNSUPPORTED_BIT_DEPTH' | 'UNSUPPORTED_LAYOUT' | 'CORRUPT_FILE';

/** Error de lectura de imagen con codigo estable (la interfaz lo traduce). */
export class ImageFormatError extends Error {
	constructor(
		readonly code: ImageFormatErrorCode,
		readonly params: Record<string, number | string> = {}
	) {
		super(`${code} ${JSON.stringify(params)}`);
		this.name = 'ImageFormatError';
	}
}
