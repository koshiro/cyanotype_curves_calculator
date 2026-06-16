"""Ventana principal PySide6."""

from __future__ import annotations

from pathlib import Path

from PySide6.QtWidgets import (
    QCheckBox,
    QFormLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QPushButton,
    QSpinBox,
    QTabWidget,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from cyano_curve.calculator import DEFAULT_METHODS, compute_all_curves, rank_curve_computations
from cyano_curve.exporter import export_curve_set, read_curve_samples, write_curve_preview
from cyano_curve.extractor import extract_groups_from_scan
from cyano_curve.generator import (
    METHOD_STEPS,
    write_comparison_target,
    write_composite_target,
    write_corrected_target,
)
from cyano_curve.reports import write_report_comparison
from cyano_curve.validation import write_validation_report, write_validation_sheet

from .widgets import PathRow, PreviewLabel, run_action


class MainWindow(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("Cyano Curve")
        tabs = QTabWidget()
        tabs.addTab(TargetTab(), "Targets")
        tabs.addTab(AnalyzeTab(), "Analizar")
        tabs.addTab(CorrectTargetTab(), "Segunda ronda")
        tabs.addTab(ComparisonTab(), "Comparar")
        tabs.addTab(ValidationTab(), "Validacion")
        tabs.addTab(PreviewTab(), "Preview curvas")
        self.setCentralWidget(tabs)


class MethodSelector(QGroupBox):
    def __init__(self) -> None:
        super().__init__("Metodos")
        self.checkboxes: dict[str, QCheckBox] = {}
        layout = QHBoxLayout(self)
        for method in sorted(METHOD_STEPS):
            checkbox = QCheckBox(method)
            checkbox.setChecked(True)
            self.checkboxes[method] = checkbox
            layout.addWidget(checkbox)

    def selected(self) -> tuple[str, ...]:
        selected = tuple(method for method, checkbox in self.checkboxes.items() if checkbox.isChecked())
        if not selected:
            raise ValueError("Selecciona al menos un metodo.")
        return selected


class TargetTab(QWidget):
    def __init__(self) -> None:
        super().__init__()
        self.methods = MethodSelector()
        self.output = PathRow("Salida target", mode="save_file", file_filter="PNG (*.png)")
        self.layout_path = PathRow("Layout", mode="save_file", file_filter="JSON (*.json)")
        self.curve = PathRow("Curva para comparativa", file_filter="Curvas (*.acv *.settings)")
        self.comparison_output = PathRow("Salida comparativa", mode="save_file", file_filter="PNG (*.png)")
        self.comparison_layout = PathRow("Layout comparativo", mode="save_file", file_filter="JSON (*.json)")
        self.preview = PreviewLabel()

        generate = QPushButton("Generar target compuesto")
        generate.clicked.connect(self._generate_target)
        comparison = QPushButton("Generar base vs corregido")
        comparison.clicked.connect(self._generate_comparison)

        layout = QVBoxLayout(self)
        layout.addWidget(QLabel("Genera targets de calibracion. Imprime estos PNG tal como salen."))
        layout.addWidget(self.methods)
        layout.addWidget(self.output)
        layout.addWidget(self.layout_path)
        layout.addWidget(generate)
        layout.addSpacing(18)
        layout.addWidget(QLabel("Comparativa en una hoja: columna base y columna corregida."))
        layout.addWidget(self.curve)
        layout.addWidget(self.comparison_output)
        layout.addWidget(self.comparison_layout)
        layout.addWidget(comparison)
        layout.addWidget(self.preview, 1)

    def _generate_target(self) -> None:
        def action() -> str:
            layout = write_composite_target(
                self.output.path(),
                methods=self.methods.selected(),
                layout_path=self.layout_path.path() if self.layout_path.edit.text() else None,
            )
            self.preview.show_image(self.output.path())
            return f"Target generado con {len(layout.patches)} parches."

        run_action(self, action)

    def _generate_comparison(self) -> None:
        def action() -> str:
            layout = write_comparison_target(
                self.comparison_output.path(),
                curve_samples=read_curve_samples(self.curve.path()),
                methods=self.methods.selected(),
                layout_path=self.comparison_layout.path() if self.comparison_layout.edit.text() else None,
            )
            self.preview.show_image(self.comparison_output.path())
            return f"Comparativa generada con {len(layout.patches)} parches."

        run_action(self, action)


class AnalyzeTab(QWidget):
    def __init__(self) -> None:
        super().__init__()
        self.scan = PathRow("Escaneo", file_filter="Imagenes (*.png *.jpg *.jpeg *.tif *.tiff)")
        self.layout_path = PathRow("Layout", file_filter="JSON (*.json)")
        self.output_dir = PathRow("Carpeta salida", mode="directory")
        self.report = PathRow("Reporte", mode="save_file", file_filter="JSON (*.json)")
        self.prefix = QTextEdit("carta")
        self.prefix.setMaximumHeight(32)
        self.log = QTextEdit()
        self.log.setReadOnly(True)
        analyze = QPushButton("Analizar y exportar curvas")
        analyze.clicked.connect(self._analyze)

        form = QFormLayout()
        form.addRow(self.scan)
        form.addRow(self.layout_path)
        form.addRow(self.output_dir)
        form.addRow(self.report)
        form.addRow("Prefijo", self.prefix)

        layout = QVBoxLayout(self)
        layout.addLayout(form)
        layout.addWidget(analyze)
        layout.addWidget(self.log, 1)

    def _analyze(self) -> None:
        def action() -> str:
            groups = extract_groups_from_scan(self.scan.path(), self.layout_path.path())
            computations = []
            output_dir = self.output_dir.path()
            prefix_text = self.prefix.toPlainText().strip() or "curva"
            for group_name, measurements in groups.items():
                result = compute_all_curves(
                    measurements.input_values,
                    measurements.measured_values,
                    methods=DEFAULT_METHODS,
                    target_method=group_name,
                )
                computations.append(result)
                prefix = prefix_text if len(groups) == 1 else f"{prefix_text}_{group_name}"
                export_curve_set(result.curves, output_dir, prefix=prefix)
            ranking = rank_curve_computations(computations)
            if self.report.edit.text():
                import json

                report_path = self.report.path()
                report_path.parent.mkdir(parents=True, exist_ok=True)
                report_path.write_text(
                    json.dumps({"ranking": ranking}, indent=2, ensure_ascii=False),
                    encoding="utf-8",
                )
            self.log.setPlainText(_format_ranking(ranking))
            return "Analisis completado."

        run_action(self, action)


class CorrectTargetTab(QWidget):
    def __init__(self) -> None:
        super().__init__()
        self.layout_path = PathRow("Layout original", file_filter="JSON (*.json)")
        self.curve = PathRow("Curva", file_filter="Curvas (*.acv *.settings)")
        self.output = PathRow("Salida PNG", mode="save_file", file_filter="PNG (*.png)")
        self.output_layout = PathRow("Layout corregido", mode="save_file", file_filter="JSON (*.json)")
        self.preview = PreviewLabel()
        button = QPushButton("Generar target corregido")
        button.clicked.connect(self._generate)

        layout = QVBoxLayout(self)
        layout.addWidget(QLabel("Aplica una curva a un target para segunda ronda. No invierte la imagen."))
        layout.addWidget(self.layout_path)
        layout.addWidget(self.curve)
        layout.addWidget(self.output)
        layout.addWidget(self.output_layout)
        layout.addWidget(button)
        layout.addWidget(self.preview, 1)

    def _generate(self) -> None:
        def action() -> str:
            layout = write_corrected_target(
                self.layout_path.path(),
                read_curve_samples(self.curve.path()),
                self.output.path(),
                layout_path=self.output_layout.path() if self.output_layout.edit.text() else None,
            )
            self.preview.show_image(self.output.path())
            return f"Target corregido generado con {len(layout.patches)} parches."

        run_action(self, action)


class ComparisonTab(QWidget):
    def __init__(self) -> None:
        super().__init__()
        self.before = PathRow("Ranking anterior", file_filter="JSON (*.json)")
        self.after = PathRow("Ranking nuevo", file_filter="JSON (*.json)")
        self.output = PathRow("Salida comparacion", mode="save_file", file_filter="JSON (*.json)")
        self.log = QTextEdit()
        self.log.setReadOnly(True)
        button = QPushButton("Comparar reportes")
        button.clicked.connect(self._compare)

        layout = QVBoxLayout(self)
        layout.addWidget(self.before)
        layout.addWidget(self.after)
        layout.addWidget(self.output)
        layout.addWidget(button)
        layout.addWidget(self.log, 1)

    def _compare(self) -> None:
        def action() -> str:
            comparison = write_report_comparison(self.before.path(), self.after.path(), self.output.path())
            self.log.setPlainText(_format_comparison(comparison["comparisons"]))
            return "Comparacion completada."

        run_action(self, action)


class ValidationTab(QWidget):
    def __init__(self) -> None:
        super().__init__()
        self.image = PathRow("Imagen", file_filter="Imagenes (*.png *.jpg *.jpeg *.tif *.tiff)")
        self.curves = QTextEdit()
        self.curves.setPlaceholderText("Una curva por linea (.acv o .settings)")
        self.output = PathRow("Hoja salida", mode="save_file", file_filter="PNG (*.png)")
        self.layout_path = PathRow("Layout", mode="save_file", file_filter="JSON (*.json)")
        self.columns = QSpinBox()
        self.columns.setRange(1, 4)
        self.columns.setValue(2)
        self.scan = PathRow("Escaneo validacion", file_filter="Imagenes (*.png *.jpg *.jpeg *.tif *.tiff)")
        self.report = PathRow("Reporte validacion", mode="save_file", file_filter="JSON (*.json)")
        self.preview = PreviewLabel()
        generate = QPushButton("Generar hoja de validacion")
        generate.clicked.connect(self._generate)
        analyze = QPushButton("Analizar hoja escaneada")
        analyze.clicked.connect(self._analyze)

        layout = QVBoxLayout(self)
        layout.addWidget(QLabel("La hoja de validacion aplica curva e invierte automaticamente para negativo."))
        layout.addWidget(self.image)
        layout.addWidget(QLabel("Curvas"))
        layout.addWidget(self.curves)
        layout.addWidget(self.output)
        layout.addWidget(self.layout_path)
        layout.addWidget(QLabel("Columnas"))
        layout.addWidget(self.columns)
        layout.addWidget(generate)
        layout.addWidget(self.scan)
        layout.addWidget(self.report)
        layout.addWidget(analyze)
        layout.addWidget(self.preview, 1)

    def _generate(self) -> None:
        def action() -> str:
            curves = _lines(self.curves)
            layout = write_validation_sheet(
                self.image.path(),
                curves,
                self.output.path(),
                layout_path=self.layout_path.path() if self.layout_path.edit.text() else None,
                columns=self.columns.value(),
            )
            self.preview.show_image(self.output.path())
            return f"Hoja generada con {len(layout.tiles)} curva(s)."

        run_action(self, action)

    def _analyze(self) -> None:
        def action() -> str:
            report = write_validation_report(self.scan.path(), self.layout_path.path(), self.report.path())
            return f"Reporte generado con {len(report['tiles'])} curva(s)."

        run_action(self, action)


class PreviewTab(QWidget):
    def __init__(self) -> None:
        super().__init__()
        self.curves = QTextEdit()
        self.curves.setPlaceholderText("Una curva por linea (.acv o .settings)")
        self.output = PathRow("Preview PNG", mode="save_file", file_filter="PNG (*.png)")
        self.preview = PreviewLabel()
        button = QPushButton("Generar preview")
        button.clicked.connect(self._preview)

        layout = QVBoxLayout(self)
        layout.addWidget(QLabel("Previsualiza graficamente curvas sin abrir Photoshop."))
        layout.addWidget(self.curves)
        layout.addWidget(self.output)
        layout.addWidget(button)
        layout.addWidget(self.preview, 1)

    def _preview(self) -> None:
        def action() -> str:
            curves = {Path(path).stem: read_curve_samples(path) for path in _lines(self.curves)}
            write_curve_preview(curves, self.output.path())
            self.preview.show_image(self.output.path())
            return "Preview generado."

        run_action(self, action)


def _lines(widget: QTextEdit) -> list[Path]:
    paths = [Path(line.strip()).expanduser() for line in widget.toPlainText().splitlines() if line.strip()]
    if not paths:
        raise ValueError("Agrega al menos una ruta.")
    return paths


def _format_ranking(ranking: list[dict[str, object]]) -> str:
    rows = ["Ranking por calidad:"]
    for row in ranking:
        warnings = row["warnings"]
        warning = f" | {warnings[0]}" if warnings else ""
        rows.append(
            f"{row['rank']}. {row['target_method']} - score {row['data_score']} - "
            f"{row['n_unique_measured']}/{row['n_patches']} tonos - recomendada {row['recommended_math_method']}{warning}"
        )
    return "\n".join(rows)


def _format_comparison(rows: list[dict[str, object]]) -> str:
    lines = ["Comparacion de rondas:"]
    for row in rows:
        lines.append(
            f"{row['target_method']}: tonos {row['before_unique_tones']} -> {row['after_unique_tones']} "
            f"({row['delta_unique_tones']:+}), score {row['before_score']} -> {row['after_score']} "
            f"({row['delta_score']:+}), rango {row['before_luminance_span']} -> {row['after_luminance_span']} "
            f"({row['delta_luminance_span']:+})"
        )
    return "\n".join(lines)
