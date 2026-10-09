/**
 * Imagen en memoria independiente del formato de origen.
 *
 * `data` guarda valores 0..1 codificados en sRGB (no lineales), entrelazados por canal.
 * Un escaneo de 16 bits conserva su precision en Float32; uno de 8 bits se normaliza igual.
 * El nucleo asume sRGB: el manejo de perfiles ICC queda para mas adelante.
 */
export interface RasterImage {
	width: number;
	height: number;
	/** 1 = gris, 3 = RGB. El alfa se descarta al decodificar. */
	channels: 1 | 3;
	data: Float32Array;
	/** Profundidad original (8 o 16), informativa. */
	bitDepth: number;
	/** Resolucion declarada por el archivo, si la trae. */
	dpi?: number;
	/** Orientacion EXIF/TIFF (1..8) declarada por el archivo; 2, 4, 5 y 7 implican espejo. */
	orientation?: number;
}

/** true si la orientacion declarada por el archivo incluye un espejado. */
export function orientationMirrors(orientation: number | undefined): boolean {
	return orientation === 2 || orientation === 4 || orientation === 5 || orientation === 7;
}

export function createImage(width: number, height: number, channels: 1 | 3, bitDepth = 8): RasterImage {
	return { width, height, channels, bitDepth, data: new Float32Array(width * height * channels) };
}

/**
 * Luminancia sRGB codificada (0..1) de cada pixel: suficiente para detectar marcas.
 * Con imagenes en gris devuelve el mismo arreglo (sin copiar): no debe modificarse.
 */
export function toGray(image: RasterImage): Float32Array {
	const { width, height, channels, data } = image;
	if (channels === 1) return data;
	const gray = new Float32Array(width * height);
	for (let i = 0, j = 0; i < gray.length; i++, j += 3) {
		gray[i] = 0.2126 * data[j]! + 0.7152 * data[j + 1]! + 0.0722 * data[j + 2]!;
	}
	return gray;
}

/** Muestra bilineal de un plano (un canal) en coordenadas de pixel con centro en +0.5. */
export function sampleBilinear(
	plane: Float32Array,
	width: number,
	height: number,
	x: number,
	y: number,
	channels = 1,
	channel = 0
): number {
	const fx = Math.min(Math.max(x - 0.5, 0), width - 1);
	const fy = Math.min(Math.max(y - 0.5, 0), height - 1);
	const x0 = Math.floor(fx);
	const y0 = Math.floor(fy);
	const x1 = Math.min(x0 + 1, width - 1);
	const y1 = Math.min(y0 + 1, height - 1);
	const tx = fx - x0;
	const ty = fy - y0;
	const at = (xx: number, yy: number) => plane[(yy * width + xx) * channels + channel]!;
	const top = at(x0, y0) + (at(x1, y0) - at(x0, y0)) * tx;
	const bottom = at(x0, y1) + (at(x1, y1) - at(x0, y1)) * tx;
	return top + (bottom - top) * ty;
}

/** Luminancia bilineal en (x, y) sin construir un plano gris completo. */
export function luminanceAt(image: RasterImage, x: number, y: number): number {
	const { data, width, height, channels } = image;
	if (channels === 1) return sampleBilinear(data, width, height, x, y);
	return (
		0.2126 * sampleBilinear(data, width, height, x, y, 3, 0) +
		0.7152 * sampleBilinear(data, width, height, x, y, 3, 1) +
		0.0722 * sampleBilinear(data, width, height, x, y, 3, 2)
	);
}
