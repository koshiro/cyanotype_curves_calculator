"""Extraccion de mediciones desde un escaneo de cianotipo."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from .models import TargetLayout, load_layout


@dataclass(frozen=True)
class PatchMeasurements:
    input_values: np.ndarray
    measured_values: np.ndarray
    aligned_rgb: np.ndarray
    method: str = ""


def extract_from_scan(
    image_path: str | Path,
    layout: TargetLayout | str | Path,
    *,
    inner_fraction: float = 0.62,
) -> PatchMeasurements:
    """Lee un escaneo, lo alinea y mide la luminosidad de cada parche."""

    if not isinstance(layout, TargetLayout):
        layout = load_layout(layout)

    image_bgr = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
    if image_bgr is None:
        raise FileNotFoundError(f"No se pudo leer la imagen: {image_path}")
    image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    aligned_rgb = align_scan(image_rgb, layout)
    measured = measure_patches(aligned_rgb, layout, inner_fraction=inner_fraction)
    inputs = np.array([patch.input_value for patch in layout.patches], dtype=np.float64)
    return PatchMeasurements(inputs, measured, aligned_rgb, method=layout.method)


def extract_groups_from_scan(
    image_path: str | Path,
    layout: TargetLayout | str | Path,
    *,
    inner_fraction: float = 0.62,
) -> dict[str, PatchMeasurements]:
    """Lee un escaneo compuesto y separa mediciones por metodo."""

    if not isinstance(layout, TargetLayout):
        layout = load_layout(layout)

    image_bgr = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
    if image_bgr is None:
        raise FileNotFoundError(f"No se pudo leer la imagen: {image_path}")
    image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    aligned_rgb = align_scan(image_rgb, layout)
    measured = measure_patches(aligned_rgb, layout, inner_fraction=inner_fraction)

    groups: dict[str, list[int]] = {}
    for position, patch in enumerate(layout.patches):
        groups.setdefault(patch.method or layout.method, []).append(position)

    result: dict[str, PatchMeasurements] = {}
    for method, positions in groups.items():
        patches = [layout.patches[position] for position in positions]
        order = np.argsort([patch.input_value for patch in patches])
        ordered_positions = np.array(positions)[order]
        result[method] = PatchMeasurements(
            input_values=np.array([patches[index].input_value for index in order], dtype=np.float64),
            measured_values=measured[ordered_positions],
            aligned_rgb=aligned_rgb,
            method=method,
        )
    return result


def align_scan(image_rgb: np.ndarray, layout: TargetLayout) -> np.ndarray:
    """Rectifica perspectiva usando las cuatro marcas de registro."""

    try:
        source_points = detect_registration_markers(image_rgb)
        destination_points = np.array(layout.marker_centers, dtype=np.float32)
    except ValueError:
        source_points = detect_print_area_corners(image_rgb)
        destination_points = np.array(
            [
                (0, 0),
                (layout.width - 1, 0),
                (layout.width - 1, layout.height - 1),
                (0, layout.height - 1),
            ],
            dtype=np.float32,
        )
    transform = cv2.getPerspectiveTransform(source_points, destination_points)
    return cv2.warpPerspective(
        image_rgb,
        transform,
        (layout.width, layout.height),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REPLICATE,
    )


def detect_registration_markers(image_rgb: np.ndarray) -> np.ndarray:
    """Detecta centros de marcas claras u oscuras y los ordena TL, TR, BR, BL."""

    for polarity in ("light", "dark"):
        points = _detect_corner_markers(image_rgb, polarity=polarity)
        if points is not None:
            return points
    raise ValueError("No se detectaron las cuatro marcas de registro.")


def detect_print_area_corners(image_rgb: np.ndarray) -> np.ndarray:
    """Detecta las esquinas del area azul impresa como respaldo."""

    hsv = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2HSV)
    saturation = hsv[:, :, 1]
    value = hsv[:, :, 2]
    mask = ((saturation > 25) & (value < 245)).astype(np.uint8) * 255
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (17, 17))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        raise ValueError("No se pudo detectar el area impresa del cianotipo.")

    contour = max(contours, key=cv2.contourArea)
    if cv2.contourArea(contour) < image_rgb.shape[0] * image_rgb.shape[1] * 0.2:
        raise ValueError("El area impresa detectada es demasiado pequena.")

    epsilon = 0.03 * cv2.arcLength(contour, True)
    polygon = cv2.approxPolyDP(contour, epsilon, True)
    if len(polygon) == 4:
        points = polygon.reshape(4, 2).astype(np.float32)
    else:
        box = cv2.boxPoints(cv2.minAreaRect(contour))
        points = box.astype(np.float32)
    return _order_extreme_points(points)


def measure_patches(
    aligned_rgb: np.ndarray,
    layout: TargetLayout,
    *,
    inner_fraction: float = 0.62,
) -> np.ndarray:
    """Mide luminosidad L* aproximada en el centro de cada parche."""

    if not 0 < inner_fraction <= 1:
        raise ValueError("inner_fraction debe estar en el rango (0, 1].")

    lab = cv2.cvtColor(aligned_rgb, cv2.COLOR_RGB2LAB)
    l_channel = lab[:, :, 0].astype(np.float64)

    values: list[float] = []
    shrink = (1 - inner_fraction) / 2
    for patch in layout.patches:
        x0, y0, x1, y1 = patch.box
        width = x1 - x0
        height = y1 - y0
        ix0 = int(round(x0 + width * shrink))
        ix1 = int(round(x1 - width * shrink))
        iy0 = int(round(y0 + height * shrink))
        iy1 = int(round(y1 - height * shrink))
        crop = l_channel[iy0:iy1, ix0:ix1]
        if crop.size == 0:
            raise ValueError(f"El parche {patch.index} quedo fuera de la imagen alineada.")
        values.append(float(np.median(crop)))

    return np.array(values, dtype=np.float64)


def _detect_corner_markers(image_rgb: np.ndarray, *, polarity: str) -> np.ndarray | None:
    gray = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    height, width = blurred.shape
    roi_width = max(1, int(width * 0.28))
    roi_height = max(1, int(height * 0.28))
    regions = (
        (0, 0, roi_width, roi_height, (0.0, 0.0)),
        (width - roi_width, 0, width, roi_height, (float(width), 0.0)),
        (width - roi_width, height - roi_height, width, height, (float(width), float(height))),
        (0, height - roi_height, roi_width, height, (0.0, float(height))),
    )

    points: list[tuple[float, float]] = []
    for x0, y0, x1, y1, expected_corner in regions:
        roi = blurred[y0:y1, x0:x1]
        if polarity == "dark":
            threshold = min(95, int(np.percentile(roi, 10)) + 18)
            mask = (roi <= threshold).astype(np.uint8) * 255
        else:
            threshold = max(155, int(np.percentile(roi, 92)) - 10)
            mask = (roi >= threshold).astype(np.uint8) * 255

        marker = _best_square_component(
            mask,
            offset=(x0, y0),
            image_area=width * height,
            expected_corner=expected_corner,
        )
        if marker is None:
            return None
        points.append(marker)
    return np.array(points, dtype=np.float32)


def _best_square_component(
    mask: np.ndarray,
    *,
    offset: tuple[int, int],
    image_area: int,
    expected_corner: tuple[float, float],
) -> tuple[float, float] | None:
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    min_area = image_area * 0.000015
    max_area = image_area * 0.008
    candidates: list[tuple[float, float, float]] = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if not min_area <= area <= max_area:
            continue
        x, y, width, height = cv2.boundingRect(contour)
        aspect = width / max(height, 1)
        if not 0.45 <= aspect <= 2.2:
            continue
        moments = cv2.moments(contour)
        if moments["m00"] == 0:
            continue
        cx = moments["m10"] / moments["m00"] + offset[0]
        cy = moments["m01"] / moments["m00"] + offset[1]
        square_score = 1.0 / (abs(1.0 - aspect) + 0.15)
        distance = float(np.hypot(cx - expected_corner[0], cy - expected_corner[1]))
        corner_score = 1.0 / (distance + 1.0)
        candidates.append((area * square_score * corner_score, cx, cy))

    if not candidates:
        return None
    _, cx, cy = max(candidates, key=lambda item: item[0])
    return cx, cy


def _order_extreme_points(points: np.ndarray) -> np.ndarray:
    sums = points.sum(axis=1)
    diffs = points[:, 0] - points[:, 1]
    ordered = np.array(
        [
            points[np.argmin(sums)],
            points[np.argmax(diffs)],
            points[np.argmax(sums)],
            points[np.argmin(diffs)],
        ],
        dtype=np.float32,
    )

    if len({tuple(point) for point in ordered}) != 4:
        raise ValueError("Las marcas detectadas no son geometricamente unicas.")
    return ordered
