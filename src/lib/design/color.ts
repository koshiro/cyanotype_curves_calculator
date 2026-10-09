/**
 * Conversion OKLCH → sRGB y contraste WCAG 2.2.
 * Se usa para verificar los tokens en CI y, mas adelante, en previsualizaciones.
 */

export type Rgb = readonly [r: number, g: number, b: number];

/** OKLCH (L 0..1, C, H en grados) → sRGB 0..255, recortado al gamut. */
export function oklchToSrgb(l: number, c: number, h: number): Rgb {
	const a = c * Math.cos((h * Math.PI) / 180);
	const b = c * Math.sin((h * Math.PI) / 180);
	const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
	const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
	const s_ = l - 0.0894841775 * a - 1.291485548 * b;
	const [lc, mc, sc] = [l_ ** 3, m_ ** 3, s_ ** 3];
	const linear = [
		4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
		-1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
		-0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc
	];
	const [r, g, bl] = linear.map((v) => {
		const x = Math.min(Math.max(v, 0), 1);
		const encoded = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
		return Math.round(encoded * 255);
	});
	return [r!, g!, bl!];
}

/** Parsea `oklch(L C H)` con L en 0..1 o en porcentaje. */
export function parseOklch(value: string): Rgb {
	const match = /oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*\)/.exec(value);
	if (!match) throw new Error(`No es un color oklch(): ${value}`);
	const l = Number(match[1]) / (match[2] ? 100 : 1);
	return oklchToSrgb(l, Number(match[3]), Number(match[4]));
}

function relativeLuminance([r, g, b]: Rgb): number {
	const lin = (v: number) => {
		const c = v / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
	const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
	return (hi! + 0.05) / (lo! + 0.05);
}
