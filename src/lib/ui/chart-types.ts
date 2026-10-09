/** Series de LineChart. */
export interface ChartLine {
	id: string;
	label: string;
	color: string;
	/** Valor Y para cada X entero del dominio (indice = X). */
	values: readonly number[];
	/** Linea de referencia: gris, sin leyenda ni lectura en el cursor. */
	reference?: boolean;
}

export interface ChartDots {
	id: string;
	label: string;
	color: string;
	points: readonly { x: number; y: number; hollow?: boolean }[];
}
