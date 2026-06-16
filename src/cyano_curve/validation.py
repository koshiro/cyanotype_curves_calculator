"""Generacion y lectura de hojas de validacion de curvas."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
import json

import cv2
import numpy as np
from PIL import Image, ImageDraw

from .exporter import read_curve_samples
from .extractor import align_scan
from .models import Patch, TargetLayout


@dataclass(frozen=True)
class ValidationTile:
    label: str
    curve_path: str
    image_box: tuple[int, int, int, int]
    wedge_boxes: tuple[tuple[int, int, int, int], ...]
    wedge_input_values: tuple[int, ...]


@dataclass(frozen=True)
class ValidationLayout:
    width: int
    height: int
    margin: int
    marker_size: int
    marker_centers: tuple[tuple[float, float], ...]
    tiles: tuple[ValidationTile, ...]

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "ValidationLayout":
        return cls(
            width=int(data["width"]),
            height=int(data["height"]),
            margin=int(data["margin"]),
            marker_size=int(data["marker_size"]),
            marker_centers=tuple(tuple(map(float, center)) for center in data["marker_centers"]),
            tiles=tuple(
                ValidationTile(
                    label=str(tile["label"]),
                    curve_path=str(tile["curve_path"]),
                    image_box=tuple(map(int, tile["image_box"])),
                    wedge_boxes=tuple(tuple(map(int, box)) for box in tile["wedge_boxes"]),
                    wedge_input_values=tuple(map(int, tile["wedge_input_values"])),
                )
                for tile in data["tiles"]
            ),
        )

    def as_target_layout(self) -> TargetLayout:
        patches = []
        for tile_index, tile in enumerate(self.tiles):
            patches.append(Patch(tile_index, 0, tile.image_box, tile.label))
        return TargetLayout(
            method="validation_letter",
            width=self.width,
            height=self.height,
            rows=0,
            columns=0,
            patch_size=0,
            gap=0,
            margin=self.margin,
            marker_size=self.marker_size,
            marker_centers=self.marker_centers,
            patches=tuple(patches),
        )


def save_validation_layout(layout: ValidationLayout, path: str | Path) -> None:
    Path(path).write_text(json.dumps(layout.to_dict(), indent=2), encoding="utf-8")


def load_validation_layout(path: str | Path) -> ValidationLayout:
    return ValidationLayout.from_dict(json.loads(Path(path).read_text(encoding="utf-8")))


def write_validation_sheet(
    image_path: str | Path,
    curve_paths: list[str | Path],
    output_path: str | Path,
    *,
    layout_path: str | Path | None = None,
    columns: int = 2,
) -> ValidationLayout:
    """Genera una hoja carta con miniaturas negativas para comparar curvas."""

    image = Image.open(image_path).convert("L")
    curves = [(Path(path), read_curve_samples(path)) for path in curve_paths]
    layout = build_validation_layout(curves, columns=columns)
    sheet = Image.new("RGB", (layout.width, layout.height), "white")
    draw = ImageDraw.Draw(sheet)

    for tile, (_, samples) in zip(layout.tiles, curves, strict=True):
        thumbnail = _fit_grayscale(image, _box_size(tile.image_box))
        corrected = apply_curve_as_negative(thumbnail, samples)
        sheet.paste(Image.fromarray(corrected, mode="L").convert("RGB"), tile.image_box[:2])
        _draw_wedge(draw, tile, samples)
        draw.text((tile.image_box[0], tile.image_box[3] + 8), tile.label, fill=(0, 0, 0))
        draw.rectangle(tile.image_box, outline=(0, 0, 0), width=2)

    _draw_registration_markers(draw, layout)
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output_path)

    if layout_path is None:
        layout_path = output_path.with_suffix(".layout.json")
    save_validation_layout(layout, layout_path)
    return layout


def analyze_validation_scan(scan_path: str | Path, layout_path: str | Path) -> dict:
    """Lee la hoja expuesta y calcula metricas por curva/miniatura."""

    layout = load_validation_layout(layout_path)
    image_bgr = cv2.imread(str(scan_path), cv2.IMREAD_COLOR)
    if image_bgr is None:
        raise FileNotFoundError(f"No se pudo leer la imagen: {scan_path}")
    image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    aligned = align_scan(image_rgb, layout.as_target_layout())
    lab = cv2.cvtColor(aligned, cv2.COLOR_RGB2LAB)
    l_channel = lab[:, :, 0].astype(np.float64)

    results = []
    for tile in layout.tiles:
        image_crop = _crop_inner(l_channel, tile.image_box, inner_fraction=0.82)
        wedge_values = np.array(
            [float(np.median(_crop_inner(l_channel, box, inner_fraction=0.7))) for box in tile.wedge_boxes],
            dtype=np.float64,
        )
        tone = _normalize_positive_tone_from_lightness(wedge_values)
        ideal = np.linspace(0, 255, len(tone))
        deltas = np.diff(tone)
        results.append(
            {
                "label": tile.label,
                "curve_path": tile.curve_path,
                "image_lightness_mean": float(np.mean(image_crop)),
                "image_lightness_std": float(np.std(image_crop)),
                "wedge_tone_values": [float(value) for value in tone],
                "wedge_rmse": float(np.sqrt(np.mean((tone - ideal) ** 2))),
                "wedge_range": float(np.max(tone) - np.min(tone)),
                "wedge_step_std": float(np.std(deltas)),
                "monotonic_violations": int(np.sum(deltas < -1e-6)),
            }
        )
    return {"layout": str(layout_path), "scan": str(scan_path), "tiles": results}


def write_validation_report(scan_path: str | Path, layout_path: str | Path, output_path: str | Path) -> dict:
    report = analyze_validation_scan(scan_path, layout_path)
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def build_validation_layout(
    curves: list[tuple[Path, np.ndarray]],
    *,
    columns: int = 2,
    width: int = 2550,
    height: int = 3300,
    margin: int = 160,
    marker_size: int = 80,
) -> ValidationLayout:
    rows = int(np.ceil(len(curves) / columns))
    tile_gap = 70
    content_margin = margin + marker_size + 50
    usable_width = width - content_margin * 2 - (columns - 1) * tile_gap
    usable_height = height - content_margin * 2 - (rows - 1) * tile_gap
    tile_width = usable_width // columns
    tile_height = usable_height // max(rows, 1)
    image_height = int(tile_height * 0.76)
    wedge_height = 42
    wedge_steps = tuple(int(round(value)) for value in np.linspace(0, 255, 21))

    tiles = []
    for index, (curve_path, _) in enumerate(curves):
        row, column = divmod(index, columns)
        x0 = content_margin + column * (tile_width + tile_gap)
        y0 = content_margin + row * (tile_height + tile_gap)
        image_box = (x0, y0, x0 + tile_width, y0 + image_height)
        wedge_y0 = image_box[3] + 34
        step_width = tile_width // len(wedge_steps)
        wedge_boxes = []
        for step_index in range(len(wedge_steps)):
            sx0 = x0 + step_index * step_width
            sx1 = x0 + tile_width if step_index == len(wedge_steps) - 1 else sx0 + step_width
            wedge_boxes.append((sx0, wedge_y0, sx1, wedge_y0 + wedge_height))
        tiles.append(
            ValidationTile(
                label=curve_path.stem,
                curve_path=str(curve_path),
                image_box=image_box,
                wedge_boxes=tuple(wedge_boxes),
                wedge_input_values=wedge_steps,
            )
        )

    marker_centers = (
        (margin, margin),
        (width - margin, margin),
        (width - margin, height - margin),
        (margin, height - margin),
    )
    return ValidationLayout(width, height, margin, marker_size, marker_centers, tuple(tiles))


def apply_curve_as_negative(image: Image.Image, samples: np.ndarray) -> np.ndarray:
    values = np.asarray(image.convert("L"), dtype=np.uint8)
    corrected = np.rint(samples[values]).astype(np.uint8)
    return 255 - corrected


def _draw_wedge(draw: ImageDraw.ImageDraw, tile: ValidationTile, samples: np.ndarray) -> None:
    for value, box in zip(tile.wedge_input_values, tile.wedge_boxes, strict=True):
        output = int(255 - round(samples[value]))
        draw.rectangle(box, fill=(output, output, output), outline=(0, 0, 0))


def _draw_registration_markers(draw: ImageDraw.ImageDraw, layout: ValidationLayout) -> None:
    half = layout.marker_size / 2
    for cx, cy in layout.marker_centers:
        outer = (
            int(round(cx - half)),
            int(round(cy - half)),
            int(round(cx + half)),
            int(round(cy + half)),
        )
        draw.rectangle(outer, fill=(0, 0, 0))
        inner_half = max(4, int(round(layout.marker_size * 0.16)))
        inner = (
            int(round(cx - inner_half)),
            int(round(cy - inner_half)),
            int(round(cx + inner_half)),
            int(round(cy + inner_half)),
        )
        draw.rectangle(inner, fill=(255, 255, 255))


def _fit_grayscale(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    fitted = Image.new("L", size, 255)
    copy = image.copy()
    copy.thumbnail(size, Image.Resampling.LANCZOS)
    x = (size[0] - copy.width) // 2
    y = (size[1] - copy.height) // 2
    fitted.paste(copy, (x, y))
    return fitted


def _box_size(box: tuple[int, int, int, int]) -> tuple[int, int]:
    return box[2] - box[0], box[3] - box[1]


def _crop_inner(channel: np.ndarray, box: tuple[int, int, int, int], *, inner_fraction: float) -> np.ndarray:
    x0, y0, x1, y1 = box
    shrink = (1 - inner_fraction) / 2
    width = x1 - x0
    height = y1 - y0
    ix0 = int(round(x0 + width * shrink))
    ix1 = int(round(x1 - width * shrink))
    iy0 = int(round(y0 + height * shrink))
    iy1 = int(round(y1 - height * shrink))
    return channel[iy0:iy1, ix0:ix1]


def _normalize_positive_tone_from_lightness(values: np.ndarray) -> np.ndarray:
    minimum = float(np.min(values))
    maximum = float(np.max(values))
    if np.isclose(minimum, maximum):
        return np.zeros_like(values)
    return (values - minimum) / (maximum - minimum) * 255
