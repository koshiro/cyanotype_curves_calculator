"""Interfaz de linea de comandos del calibrador."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image

from .calculator import DEFAULT_METHODS, compute_all_curves, rank_curve_computations
from .exporter import export_curve_set, read_curve_samples, write_curve_preview
from .extractor import extract_groups_from_scan
from .generator import METHOD_STEPS, write_comparison_target, write_composite_target, write_corrected_target, write_target
from .reports import write_report_comparison
from .validation import write_validation_report, write_validation_sheet


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="cyano-curve",
        description="Calibrador multi-metodo de curvas para negativos digitales de cianotipo.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    generate = subparsers.add_parser("generate", help="Genera un target de calibracion.")
    generate.add_argument(
        "--method",
        choices=sorted(METHOD_STEPS),
        default="chartthrob_51",
        help="Metodo documentado de target.",
    )
    generate.add_argument("--output", required=True, help="Ruta de la imagen target PNG/TIFF.")
    generate.add_argument("--layout", help="Ruta JSON del layout. Por defecto usa .layout.json.")
    generate.add_argument("--invert", action="store_true", help="Genera el target como negativo digital.")
    generate.set_defaults(func=_cmd_generate)

    composite = subparsers.add_parser(
        "generate-composite",
        help="Genera una hoja carta con varios metodos en una sola exposicion.",
    )
    composite.add_argument("--output", required=True, help="Ruta de la imagen target PNG/TIFF.")
    composite.add_argument("--layout", help="Ruta JSON del layout. Por defecto usa .layout.json.")
    composite.add_argument(
        "--methods",
        nargs="+",
        choices=sorted(METHOD_STEPS),
        default=["pdn_21", "pdn_31", "chartthrob_51", "gradient_256"],
        help="Metodos documentados a incluir en la hoja.",
    )
    composite.add_argument("--invert", action="store_true", help="Genera el target como negativo digital.")
    composite.set_defaults(func=_cmd_generate_composite)

    analyze = subparsers.add_parser("analyze", help="Analiza un escaneo y exporta curvas.")
    analyze.add_argument("--scan", required=True, help="Imagen escaneada del cianotipo.")
    analyze.add_argument("--layout", required=True, help="Layout JSON generado junto al target.")
    analyze.add_argument("--output-dir", required=True, help="Directorio de salida para curvas.")
    analyze.add_argument("--prefix", default="curva", help="Prefijo para los archivos exportados.")
    analyze.add_argument(
        "--methods",
        nargs="+",
        choices=DEFAULT_METHODS,
        default=list(DEFAULT_METHODS),
        help="Metodos matematicos a calcular.",
    )
    analyze.add_argument("--aligned-output", help="Guarda una copia rectificada del escaneo.")
    analyze.add_argument(
        "--report",
        help="Ruta JSON con ranking de calidad de datos y curvas recomendadas.",
    )
    analyze.set_defaults(func=_cmd_analyze)

    validate_generate = subparsers.add_parser(
        "validate-generate",
        help="Genera una hoja carta con miniaturas para comparar curvas.",
    )
    validate_generate.add_argument("--image", required=True, help="Imagen base para las miniaturas.")
    validate_generate.add_argument(
        "--curves",
        nargs="+",
        required=True,
        help="Archivos de curvas .settings o .acv a comparar.",
    )
    validate_generate.add_argument("--output", required=True, help="Ruta de salida de la hoja carta.")
    validate_generate.add_argument("--layout", help="Ruta JSON del layout. Por defecto usa .layout.json.")
    validate_generate.add_argument("--columns", type=int, default=2, help="Columnas del grid.")
    validate_generate.set_defaults(func=_cmd_validate_generate)

    validate_analyze = subparsers.add_parser(
        "validate-analyze",
        help="Analiza un escaneo de la hoja de validacion y genera metricas.",
    )
    validate_analyze.add_argument("--scan", required=True, help="Escaneo del cianotipo de validacion.")
    validate_analyze.add_argument("--layout", required=True, help="Layout JSON de la hoja de validacion.")
    validate_analyze.add_argument("--output", required=True, help="Reporte JSON de metricas.")
    validate_analyze.set_defaults(func=_cmd_validate_analyze)

    preview = subparsers.add_parser("preview-curves", help="Genera un PNG para revisar curvas visualmente.")
    preview.add_argument("--curves", nargs="+", required=True, help="Archivos .acv o .settings.")
    preview.add_argument("--output", required=True, help="Ruta del PNG de previsualizacion.")
    preview.set_defaults(func=_cmd_preview_curves)

    correct_target = subparsers.add_parser(
        "correct-target",
        help="Aplica una curva a un target de calibracion para una segunda ronda.",
    )
    correct_target.add_argument("--layout", required=True, help="Layout JSON del target original.")
    correct_target.add_argument("--curve", required=True, help="Curva .acv o .settings a aplicar.")
    correct_target.add_argument("--output", required=True, help="Imagen corregida de salida.")
    correct_target.add_argument("--output-layout", help="Layout corregido. Por defecto usa .layout.json.")
    correct_target.set_defaults(func=_cmd_correct_target)

    comparison = subparsers.add_parser(
        "generate-comparison",
        help="Genera una hoja con targets base y corregido lado a lado.",
    )
    comparison.add_argument("--curve", required=True, help="Curva .acv o .settings a aplicar en columna corregida.")
    comparison.add_argument("--output", required=True, help="Imagen comparativa de salida.")
    comparison.add_argument("--layout", help="Layout JSON de salida. Por defecto usa .layout.json.")
    comparison.add_argument(
        "--methods",
        nargs="+",
        choices=sorted(METHOD_STEPS),
        default=["pdn_21", "pdn_31", "chartthrob_51", "gradient_256"],
        help="Metodos a incluir.",
    )
    comparison.set_defaults(func=_cmd_generate_comparison)

    compare_reports = subparsers.add_parser(
        "compare-reports",
        help="Compara dos rankings de analyze y muestra ganancias entre pasadas.",
    )
    compare_reports.add_argument("--before", required=True, help="ranking.json de la pasada anterior.")
    compare_reports.add_argument("--after", required=True, help="ranking.json de la nueva pasada.")
    compare_reports.add_argument("--output", required=True, help="JSON de comparacion.")
    compare_reports.set_defaults(func=_cmd_compare_reports)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    args.func(args)
    return 0


def _cmd_generate(args: argparse.Namespace) -> None:
    layout = write_target(
        args.method,
        args.output,
        layout_path=args.layout,
        invert=args.invert,
    )
    print(f"Target generado: {args.output}")
    print(f"Metodo: {layout.method} ({len(layout.patches)} parches)")


def _cmd_generate_composite(args: argparse.Namespace) -> None:
    layout = write_composite_target(
        args.output,
        methods=tuple(args.methods),
        layout_path=args.layout,
        invert=args.invert,
    )
    group_names = sorted({patch.method for patch in layout.patches})
    print(f"Target compuesto generado: {args.output}")
    print(f"Hoja: {layout.width}x{layout.height}px")
    print("Metodos incluidos: " + ", ".join(group_names))


def _cmd_analyze(args: argparse.Namespace) -> None:
    groups = extract_groups_from_scan(args.scan, args.layout)
    computations = []
    for group_name, measurements in groups.items():
        result = compute_all_curves(
            measurements.input_values,
            measurements.measured_values,
            methods=args.methods,
            target_method=group_name,
        )
        computations.append(result)
        prefix = args.prefix if len(groups) == 1 else f"{args.prefix}_{group_name}"
        export_curve_set(result.curves, args.output_dir, prefix=prefix)

    if args.aligned_output:
        path = Path(args.aligned_output)
        path.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(next(iter(groups.values())).aligned_rgb).save(path)

    ranking = rank_curve_computations(computations)
    if args.report:
        report_path = Path(args.report)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps({"ranking": ranking}, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"Curvas exportadas en: {args.output_dir}")
    print("Targets analizados: " + ", ".join(groups.keys()))
    print("Metodos matematicos: " + ", ".join(args.methods))
    print("")
    print("Ranking por calidad de datos (mas arriba = mas fiable):")
    for row in ranking:
        warnings = row["warnings"]
        warning_text = f" | {warnings[0]}" if warnings else ""
        print(
            f"  {row['rank']}. {row['target_method']} "
            f"(score {row['data_score']}, {row['n_unique_measured']}/{row['n_patches']} tonos unicos, "
            f"recomendada: {row['recommended_math_method']}){warning_text}"
        )
    if args.report:
        print(f"\nReporte JSON: {args.report}")


def _cmd_validate_generate(args: argparse.Namespace) -> None:
    layout = write_validation_sheet(
        args.image,
        [Path(path) for path in args.curves],
        args.output,
        layout_path=args.layout,
        columns=args.columns,
    )
    print(f"Hoja de validacion generada: {args.output}")
    print(f"Curvas incluidas: {len(layout.tiles)}")


def _cmd_validate_analyze(args: argparse.Namespace) -> None:
    report = write_validation_report(args.scan, args.layout, args.output)
    print(f"Reporte de validacion generado: {args.output}")
    print(f"Curvas medidas: {len(report['tiles'])}")


def _cmd_preview_curves(args: argparse.Namespace) -> None:
    curves = {Path(path).stem: read_curve_samples(path) for path in args.curves}
    write_curve_preview(curves, args.output)
    print(f"Previsualizacion generada: {args.output}")


def _cmd_correct_target(args: argparse.Namespace) -> None:
    curve_samples = read_curve_samples(args.curve)
    layout = write_corrected_target(
        args.layout,
        curve_samples,
        args.output,
        layout_path=args.output_layout,
    )
    print(f"Target corregido generado: {args.output}")
    print(f"Layout corregido: {args.output_layout or Path(args.output).with_suffix('.layout.json')}")
    print(f"Parches: {len(layout.patches)}")


def _cmd_generate_comparison(args: argparse.Namespace) -> None:
    curve_samples = read_curve_samples(args.curve)
    layout = write_comparison_target(
        args.output,
        curve_samples=curve_samples,
        methods=tuple(args.methods),
        layout_path=args.layout,
    )
    print(f"Target comparativo generado: {args.output}")
    print(f"Layout comparativo: {args.layout or Path(args.output).with_suffix('.layout.json')}")
    print(f"Grupos: {', '.join(sorted({patch.method for patch in layout.patches}))}")


def _cmd_compare_reports(args: argparse.Namespace) -> None:
    comparison = write_report_comparison(args.before, args.after, args.output)
    print(f"Comparacion generada: {args.output}")
    print("Cambios por target:")
    for row in comparison["comparisons"]:
        sign = "+" if row["delta_unique_tones"] >= 0 else ""
        score_sign = "+" if row["delta_score"] >= 0 else ""
        span_sign = "+" if row["delta_luminance_span"] >= 0 else ""
        print(
            f"  {row['target_method']}: tonos {row['before_unique_tones']} -> {row['after_unique_tones']} "
            f"({sign}{row['delta_unique_tones']}), score {row['before_score']} -> {row['after_score']} "
            f"({score_sign}{row['delta_score']}), rango {row['before_luminance_span']} -> "
            f"{row['after_luminance_span']} ({span_sign}{row['delta_luminance_span']})"
        )


if __name__ == "__main__":
    raise SystemExit(main())
