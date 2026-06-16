"""Generacion de targets de calibracion para negativos digitales."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

import numpy as np
from PIL import Image, ImageDraw

from .models import Patch, TargetLayout, load_layout, save_layout

TargetMethod = Literal["pdn_21", "pdn_31", "chartthrob_51", "gradient_256"]

METHOD_STEPS: dict[str, int] = {
    "pdn_21": 21,
    "pdn_31": 31,
    "chartthrob_51": 51,
    "gradient_256": 256,
}

METHOD_COLUMNS: dict[str, int] = {
    "pdn_21": 7,
    "pdn_31": 8,
    "chartthrob_51": 17,
    "gradient_256": 16,
}


def step_values(method: TargetMethod) -> np.ndarray:
    """Devuelve los valores RGB de entrada para el metodo solicitado."""

    steps = METHOD_STEPS[method]
    return np.rint(np.linspace(0, 255, steps)).astype(np.uint8)


def build_layout(
    method: TargetMethod,
    *,
    patch_size: int = 96,
    gap: int = 12,
    margin: int = 96,
    marker_size: int = 44,
) -> TargetLayout:
    """Construye el layout geometrico determinista del target."""

    values = step_values(method)
    columns = METHOD_COLUMNS[method]
    rows = int(np.ceil(len(values) / columns))
    grid_width = columns * patch_size + (columns - 1) * gap
    grid_height = rows * patch_size + (rows - 1) * gap
    width = grid_width + margin * 2
    height = grid_height + margin * 2

    patches: list[Patch] = []
    for index, value in enumerate(values):
        row, column = divmod(index, columns)
        x0 = margin + column * (patch_size + gap)
        y0 = margin + row * (patch_size + gap)
        patches.append(
            Patch(
                index=index,
                input_value=int(value),
                box=(x0, y0, x0 + patch_size, y0 + patch_size),
                method=method,
            )
        )

    half = marker_size / 2
    marker_centers = (
        (margin / 2, margin / 2),
        (width - margin / 2, margin / 2),
        (width - margin / 2, height - margin / 2),
        (margin / 2, height - margin / 2),
    )

    return TargetLayout(
        method=method,
        width=width,
        height=height,
        rows=rows,
        columns=columns,
        patch_size=patch_size,
        gap=gap,
        margin=margin,
        marker_size=marker_size,
        marker_centers=marker_centers,
        patches=tuple(patches),
    )


def build_composite_layout(
    methods: tuple[TargetMethod, ...] = ("pdn_21", "pdn_31", "chartthrob_51", "gradient_256"),
    *,
    width: int = 2550,
    height: int = 3300,
    patch_size: int = 96,
    gap: int = 8,
    margin: int = 160,
    section_gap: int | None = None,
    marker_size: int = 80,
) -> TargetLayout:
    """Construye una hoja carta 8.5x11 a 300 DPI con varios metodos."""

    layout_metrics = [_method_grid_metrics(method, patch_size, gap) for method in methods]
    top = margin + marker_size + 35
    bottom = height - margin - marker_size - 35
    section_gap = _distributed_section_gap([item["height"] for item in layout_metrics], top, bottom, section_gap)

    patches: list[Patch] = []
    y = top
    max_columns = 0
    for metrics in layout_metrics:
        method = metrics["method"]
        values = metrics["values"]
        columns = metrics["columns"]
        max_columns = max(max_columns, columns)

        grid_width = metrics["width"]
        x_start = (width - grid_width) // 2
        for index, value in enumerate(values):
            row, column = divmod(index, columns)
            x0 = x_start + column * (patch_size + gap)
            y0 = y + row * (patch_size + gap)
            patches.append(
                Patch(
                    index=index,
                    input_value=int(value),
                    box=(x0, y0, x0 + patch_size, y0 + patch_size),
                    method=method,
                )
            )
        y += metrics["height"] + section_gap

    if y - section_gap > bottom:
        raise ValueError("Los metodos seleccionados no caben en la hoja carta.")

    marker_centers = (
        (margin, margin),
        (width - margin, margin),
        (width - margin, height - margin),
        (margin, height - margin),
    )
    return TargetLayout(
        method="composite_letter",
        width=width,
        height=height,
        rows=0,
        columns=max_columns,
        patch_size=patch_size,
        gap=gap,
        margin=margin,
        marker_size=marker_size,
        marker_centers=marker_centers,
        patches=tuple(patches),
    )


def build_comparison_layout(
    methods: tuple[TargetMethod, ...] = ("pdn_21", "pdn_31", "chartthrob_51", "gradient_256"),
    *,
    width: int = 2550,
    height: int = 3300,
    patch_size: int | None = None,
    gap: int = 6,
    margin: int = 160,
    section_gap: int | None = None,
    marker_size: int = 80,
) -> TargetLayout:
    """Construye una hoja con target base y target corregido lado a lado."""

    column_gap = 120
    column_width = (width - margin * 2 - column_gap) // 2
    if patch_size is None:
        patch_size = _fit_patch_size_for_width(max(METHOD_COLUMNS[method] for method in methods), column_width, gap)

    layout_metrics = [_method_grid_metrics(method, patch_size, gap) for method in methods]
    top = margin + marker_size + 35
    bottom = height - margin - marker_size - 35
    section_gap = _distributed_section_gap([item["height"] for item in layout_metrics], top, bottom, section_gap)

    patches: list[Patch] = []
    y = top
    max_columns = 0
    for metrics in layout_metrics:
        method = metrics["method"]
        values = metrics["values"]
        columns = metrics["columns"]
        max_columns = max(max_columns, columns * 2)
        grid_width = metrics["width"]
        left_x = margin
        right_x = width - margin - grid_width
        for side, x_start in (("base", left_x), ("corrected", right_x)):
            for index, value in enumerate(values):
                row, column = divmod(index, columns)
                x0 = x_start + column * (patch_size + gap)
                y0 = y + row * (patch_size + gap)
                patches.append(
                    Patch(
                        index=index,
                        input_value=int(value),
                        box=(x0, y0, x0 + patch_size, y0 + patch_size),
                        method=f"{method}_{side}",
                    )
                )
        y += metrics["height"] + section_gap

    if y - section_gap > bottom:
        raise ValueError("Los metodos seleccionados no caben en la hoja comparativa.")

    marker_centers = (
        (margin, margin),
        (width - margin, margin),
        (width - margin, height - margin),
        (margin, height - margin),
    )
    return TargetLayout(
        method="comparison_letter",
        width=width,
        height=height,
        rows=0,
        columns=max_columns,
        patch_size=patch_size,
        gap=gap,
        margin=margin,
        marker_size=marker_size,
        marker_centers=marker_centers,
        patches=tuple(patches),
    )


def _method_grid_metrics(method: TargetMethod, patch_size: int, gap: int) -> dict[str, object]:
    values = step_values(method)
    columns = METHOD_COLUMNS[method]
    rows = int(np.ceil(len(values) / columns))
    return {
        "method": method,
        "values": values,
        "columns": columns,
        "rows": rows,
        "width": columns * patch_size + (columns - 1) * gap,
        "height": rows * patch_size + (rows - 1) * gap,
    }


def _distributed_section_gap(section_heights: list[int], top: int, bottom: int, requested_gap: int | None) -> int:
    if requested_gap is not None:
        return requested_gap
    if len(section_heights) <= 1:
        return 0
    available_gap = bottom - top - sum(section_heights)
    if available_gap < 0:
        raise ValueError("Las secciones no caben en el area util de la hoja.")
    return max(24, available_gap // (len(section_heights) - 1))


def _fit_patch_size_for_width(columns: int, available_width: int, gap: int) -> int:
    return max(20, (available_width - (columns - 1) * gap) // columns)


def generate_target(method: TargetMethod, *, invert: bool = False) -> tuple[Image.Image, TargetLayout]:
    """Genera una imagen RGB con parches de gris y marcas de registro.

    `invert=True` crea el negativo digital directo: los parches claros pasan a
    ser oscuros y viceversa, util para imprimir el target final.
    """

    layout = build_layout(method)
    image = Image.new("RGB", (layout.width, layout.height), "white")
    draw = ImageDraw.Draw(image)

    for patch in layout.patches:
        value = 255 - patch.input_value if invert else patch.input_value
        draw.rectangle(patch.box, fill=(value, value, value))

    _draw_registration_markers(draw, layout)
    return image, layout


def generate_composite_target(
    methods: tuple[TargetMethod, ...] = ("pdn_21", "pdn_31", "chartthrob_51", "gradient_256"),
    *,
    invert: bool = False,
) -> tuple[Image.Image, TargetLayout]:
    """Genera una hoja carta con varios targets para una sola exposicion."""

    layout = build_composite_layout(methods)
    image = Image.new("RGB", (layout.width, layout.height), "white")
    draw = ImageDraw.Draw(image)

    for patch in layout.patches:
        value = 255 - patch.input_value if invert else patch.input_value
        draw.rectangle(patch.box, fill=(value, value, value))

    _draw_registration_markers(draw, layout)
    return image, layout


def write_target(
    method: TargetMethod,
    image_path: str | Path,
    *,
    layout_path: str | Path | None = None,
    invert: bool = False,
) -> TargetLayout:
    """Guarda el target y su layout JSON asociado."""

    image, layout = generate_target(method, invert=invert)
    image_path = Path(image_path)
    image_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(image_path)

    if layout_path is None:
        layout_path = image_path.with_suffix(".layout.json")
    save_layout(layout, layout_path)
    return layout


def write_composite_target(
    image_path: str | Path,
    *,
    methods: tuple[TargetMethod, ...] = ("pdn_21", "pdn_31", "chartthrob_51", "gradient_256"),
    layout_path: str | Path | None = None,
    invert: bool = False,
) -> TargetLayout:
    """Guarda una hoja carta con multiples metodos y su layout JSON."""

    image, layout = generate_composite_target(methods, invert=invert)
    image_path = Path(image_path)
    image_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(image_path)

    if layout_path is None:
        layout_path = image_path.with_suffix(".layout.json")
    save_layout(layout, layout_path)
    return layout


def generate_corrected_target(
    layout: TargetLayout,
    curve_samples: np.ndarray,
) -> tuple[Image.Image, TargetLayout]:
    """Aplica una curva a un target existente sin invertirlo.

    En targets de calibracion, los valores de parche son valores enviados al
    negativo. Para una segunda ronda se debe guardar el valor corregido en el
    layout para que `analyze` sepa que la muestra ya llevaba una curva previa.
    """

    samples = np.asarray(curve_samples, dtype=np.float64)
    if samples.shape != (256,):
        raise ValueError("curve_samples debe contener exactamente 256 valores.")

    image = Image.new("RGB", (layout.width, layout.height), "white")
    draw = ImageDraw.Draw(image)
    corrected_patches: list[Patch] = []

    for patch in layout.patches:
        corrected = int(np.clip(round(samples[patch.input_value]), 0, 255))
        draw.rectangle(patch.box, fill=(corrected, corrected, corrected))
        corrected_patches.append(
            Patch(
                index=patch.index,
                input_value=corrected,
                box=patch.box,
                method=patch.method,
            )
        )

    corrected_layout = TargetLayout(
        method=f"{layout.method}_corrected",
        width=layout.width,
        height=layout.height,
        rows=layout.rows,
        columns=layout.columns,
        patch_size=layout.patch_size,
        gap=layout.gap,
        margin=layout.margin,
        marker_size=layout.marker_size,
        marker_centers=layout.marker_centers,
        patches=tuple(corrected_patches),
    )
    _draw_registration_markers(draw, corrected_layout)
    return image, corrected_layout


def write_corrected_target(
    source_layout_path: str | Path,
    curve_samples: np.ndarray,
    image_path: str | Path,
    *,
    layout_path: str | Path | None = None,
) -> TargetLayout:
    """Guarda un target de segunda ronda y el layout con valores corregidos."""

    source_layout = load_layout(source_layout_path)
    image, layout = generate_corrected_target(source_layout, curve_samples)
    image_path = Path(image_path)
    image_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(image_path)

    if layout_path is None:
        layout_path = image_path.with_suffix(".layout.json")
    save_layout(layout, layout_path)
    return layout


def generate_comparison_target(
    methods: tuple[TargetMethod, ...],
    curve_samples: np.ndarray,
) -> tuple[Image.Image, TargetLayout]:
    """Genera una pagina con columnas base y corregida."""

    layout = build_comparison_layout(methods)
    samples = np.asarray(curve_samples, dtype=np.float64)
    if samples.shape != (256,):
        raise ValueError("curve_samples debe contener exactamente 256 valores.")

    image = Image.new("RGB", (layout.width, layout.height), "white")
    draw = ImageDraw.Draw(image)
    corrected_patches: list[Patch] = []
    for patch in layout.patches:
        source_value = patch.input_value
        if patch.method.endswith("_corrected"):
            output_value = int(np.clip(round(samples[source_value]), 0, 255))
        else:
            output_value = source_value
        draw.rectangle(patch.box, fill=(output_value, output_value, output_value))
        corrected_patches.append(
            Patch(
                index=patch.index,
                input_value=output_value,
                box=patch.box,
                method=patch.method,
            )
        )

    comparison_layout = TargetLayout(
        method=layout.method,
        width=layout.width,
        height=layout.height,
        rows=layout.rows,
        columns=layout.columns,
        patch_size=layout.patch_size,
        gap=layout.gap,
        margin=layout.margin,
        marker_size=layout.marker_size,
        marker_centers=layout.marker_centers,
        patches=tuple(corrected_patches),
    )
    _draw_registration_markers(draw, comparison_layout)
    return image, comparison_layout


def write_comparison_target(
    image_path: str | Path,
    *,
    curve_samples: np.ndarray,
    methods: tuple[TargetMethod, ...] = ("pdn_21", "pdn_31", "chartthrob_51", "gradient_256"),
    layout_path: str | Path | None = None,
) -> TargetLayout:
    """Guarda target base/corregido para comparar en una sola exposicion."""

    image, layout = generate_comparison_target(methods, curve_samples)
    image_path = Path(image_path)
    image_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(image_path)
    if layout_path is None:
        layout_path = image_path.with_suffix(".layout.json")
    save_layout(layout, layout_path)
    return layout


def _draw_registration_markers(draw: ImageDraw.ImageDraw, layout: TargetLayout) -> None:
    half = layout.marker_size / 2
    for cx, cy in layout.marker_centers:
        box = (
            int(round(cx - half)),
            int(round(cy - half)),
            int(round(cx + half)),
            int(round(cy + half)),
        )
        draw.rectangle(box, fill=(0, 0, 0))
        inner_half = max(4, int(round(layout.marker_size * 0.16)))
        inner_box = (
            int(round(cx - inner_half)),
            int(round(cy - inner_half)),
            int(round(cx + inner_half)),
            int(round(cy + inner_half)),
        )
        draw.rectangle(inner_box, fill=(255, 255, 255))
