"""Exportadores de curvas para Photoshop y GIMP."""

from __future__ import annotations

from pathlib import Path
import re
import struct

import numpy as np

from .calculator import CurveResult, enforce_curve_bounds

ACV_VERSION = 5
ACV_CURVE_COUNT = 5
IDENTITY_POINTS: tuple[tuple[int, int], ...] = ((0, 0), (255, 255))


def write_acv(curve: CurveResult, path: str | Path) -> None:
    """Escribe un .acv compatible con Photoshop 2026."""

    points = curve.anchor_points
    if not 2 <= len(points) <= 19:
        raise ValueError(".acv acepta entre 2 y 19 puntos por curva.")

    payload = bytearray()
    payload.extend(struct.pack(">H", ACV_VERSION))
    payload.extend(struct.pack(">H", ACV_CURVE_COUNT))
    _append_acv_curve(payload, points)
    for _ in range(ACV_CURVE_COUNT - 1):
        _append_acv_curve(payload, IDENTITY_POINTS)

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(bytes(payload))


def write_acv_rgb(curve: CurveResult, path: str | Path) -> None:
    """Escribe variante legacy RGB: version 1 + Master + RGB identidad."""

    points = curve.anchor_points
    if not 2 <= len(points) <= 19:
        raise ValueError(".acv acepta entre 2 y 19 puntos por curva.")

    payload = bytearray()
    payload.extend(struct.pack(">H", 1))
    payload.extend(struct.pack(">H", 4))
    _append_acv_curve(payload, points)
    for _ in range(3):
        _append_acv_curve(payload, IDENTITY_POINTS)

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(bytes(payload))


def read_acv_points(path: str | Path) -> tuple[int, int, tuple[tuple[int, int], ...]]:
    """Lee puntos de un .acv master, util para pruebas."""

    data = Path(path).read_bytes()
    if len(data) < 6:
        raise ValueError("Archivo .acv incompleto.")
    version, curve_count = struct.unpack(">HH", data[:4])
    if curve_count < 1:
        raise ValueError("Archivo .acv sin curvas.")

    points = []
    offset = 4
    point_count = struct.unpack(">H", data[offset : offset + 2])[0]
    offset += 2
    expected = offset + point_count * 4
    if len(data) < expected:
        raise ValueError("Archivo .acv no contiene todos los puntos declarados.")
    for _ in range(point_count):
        output_value, input_value = struct.unpack(">HH", data[offset : offset + 4])
        points.append((output_value, input_value))
        offset += 4
    return version, curve_count, tuple(points)


def read_curve_samples(path: str | Path) -> np.ndarray:
    """Lee una curva .settings de GIMP o .acv y devuelve 256 samples 0..255."""

    path = Path(path)
    if path.suffix.lower() == ".settings":
        return read_gimp_samples(path)
    if path.suffix.lower() == ".acv":
        return read_acv_samples(path)
    raise ValueError(f"Formato de curva no soportado: {path.suffix}")


def read_acv_samples(path: str | Path) -> np.ndarray:
    """Interpola los puntos master de un .acv a 256 samples."""

    _, _, points = read_acv_points(path)
    ordered = sorted(points, key=lambda point: point[1])
    inputs = np.array([point[1] for point in ordered], dtype=np.float64)
    outputs = np.array([point[0] for point in ordered], dtype=np.float64)
    samples = np.interp(np.arange(256, dtype=np.float64), inputs, outputs)
    return enforce_curve_bounds(samples)


def read_gimp_samples(path: str | Path) -> np.ndarray:
    """Extrae la lista `(samples 256 ...)` de un preset moderno de GIMP."""

    text = Path(path).read_text(encoding="utf-8")
    match = re.search(r"\(samples\s+256\s+([^)]+)\)", text, flags=re.MULTILINE)
    if not match:
        raise ValueError("No se encontro una seccion `(samples 256 ...)` valida.")
    values = np.array([float(value) for value in match.group(1).split()], dtype=np.float64)
    if values.shape != (256,):
        raise ValueError("La curva GIMP debe contener exactamente 256 samples.")
    return enforce_curve_bounds(values * 255)


def write_gimp_settings(curve: CurveResult, path: str | Path) -> None:
    """Escribe un preset moderno de GIMP curves con 256 samples."""

    samples = enforce_curve_bounds(curve.samples) / 255.0
    sample_text = " ".join(f"{value:.6f}" for value in samples)
    point_values = _gimp_points(curve)
    point_count = len(point_values) // 2
    point_text = " ".join(f"{value:.6f}" for value in point_values)
    content = (
        "# GIMP curves tool settings\n"
        "(time 0)\n"
        "(channel value)\n"
        "(curve\n"
        "    (curve-type smooth)\n"
        f"    (n-points {point_count})\n"
        f"    (points {len(point_values)} {point_text})\n"
        "    (n-samples 256)\n"
        f"    (samples 256 {sample_text})\n"
        ")\n"
    )

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def export_curve_set(curves: dict[str, CurveResult], directory: str | Path, *, prefix: str = "curva") -> None:
    """Exporta todas las curvas disponibles a Photoshop y GIMP."""

    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    for name, curve in curves.items():
        write_acv(curve, directory / f"{prefix}_{name}.acv")
        write_acv_rgb(curve, directory / f"{prefix}_{name}_rgb.acv")
        write_gimp_settings(curve, directory / f"{prefix}_{name}.settings")


def write_curve_preview(curves: dict[str, np.ndarray], path: str | Path, *, size: int = 640) -> None:
    """Dibuja una previsualizacion PNG de una o varias curvas."""

    from PIL import Image, ImageDraw

    margin = 48
    image = Image.new("RGB", (size, size), "white")
    draw = ImageDraw.Draw(image)
    plot_size = size - margin * 2
    left = margin
    top = margin
    bottom = margin + plot_size
    right = margin + plot_size

    draw.rectangle((left, top, right, bottom), outline=(0, 0, 0), width=2)
    for step in range(1, 4):
        x = left + plot_size * step // 4
        y = top + plot_size * step // 4
        draw.line((x, top, x, bottom), fill=(220, 220, 220))
        draw.line((left, y, right, y), fill=(220, 220, 220))

    colors = [(20, 80, 180), (200, 50, 50), (40, 150, 70), (180, 100, 20), (120, 60, 160)]
    for index, (label, samples) in enumerate(curves.items()):
        safe = enforce_curve_bounds(samples)
        points = []
        for x_value, y_value in enumerate(safe):
            x = left + x_value / 255 * plot_size
            y = bottom - y_value / 255 * plot_size
            points.append((x, y))
        color = colors[index % len(colors)]
        draw.line(points, fill=color, width=3)
        draw.text((left, bottom + 12 + index * 18), label, fill=color)

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path)


def _byte(value: float | int) -> int:
    return int(np.clip(round(value), 0, 255))


def _append_acv_curve(payload: bytearray, points: tuple[tuple[int, int], ...]) -> None:
    payload.extend(struct.pack(">H", len(points)))
    for output_value, input_value in points:
        payload.extend(struct.pack(">H", _byte(output_value)))
        payload.extend(struct.pack(">H", _byte(input_value)))


def _gimp_points(curve: CurveResult) -> list[float]:
    normalized: list[float] = []
    for output_value, input_value in curve.anchor_points:
        normalized.extend([input_value / 255.0, output_value / 255.0])
    return normalized
