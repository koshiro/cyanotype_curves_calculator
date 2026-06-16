"""Calculo multi-metodo de curvas inversas de linearizacion."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Literal

import numpy as np
from scipy.interpolate import PchipInterpolator, UnivariateSpline, interp1d

CurveMethod = Literal["pchip", "spline", "linear", "polynomial"]
MeasurementPolarity = Literal["cyanotype_negative", "positive"]
DEFAULT_METHODS: tuple[CurveMethod, ...] = ("pchip", "spline", "linear", "polynomial")

# Umbral minimo de separacion entre parches para considerar la medicion util.
_MEASURED_STEP_MIN = 0.75
_INPUT_STEP_MIN = 2.0
_EMPASTADO_MEASURED_EPS = 3.0


@dataclass(frozen=True)
class MeasurementQuality:
    """Calidad de los datos medidos antes de generar curvas."""

    n_patches: int
    n_unique_measured: int
    raw_luminance_span: float
    empastado_patches: int
    plateau_tail_measured: float | None
    data_score: float
    warnings: tuple[str, ...]


@dataclass(frozen=True)
class CurveResult:
    method: CurveMethod
    samples: np.ndarray
    anchor_points: tuple[tuple[int, int], ...]
    clipped_fraction: float = 0.0
    extrapolated_tail: bool = False


@dataclass(frozen=True)
class CurveComputation:
    """Resultado completo de calcular curvas para un target."""

    curves: dict[str, CurveResult]
    quality: MeasurementQuality
    target_method: str = ""


def compute_all_curves(
    input_values: Iterable[float],
    measured_values: Iterable[float],
    *,
    methods: Iterable[CurveMethod] = DEFAULT_METHODS,
    measurement_polarity: MeasurementPolarity = "cyanotype_negative",
    sample_count: int = 256,
    target_method: str = "",
) -> CurveComputation:
    """Calcula una curva inversa por cada metodo solicitado."""

    x_measured, y_input, quality = prepare_inverse_points(
        input_values,
        measured_values,
        measurement_polarity=measurement_polarity,
    )
    curves = {
        method: compute_curve(
            x_measured,
            y_input,
            method=method,
            sample_count=sample_count,
        )
        for method in methods
    }
    return CurveComputation(curves=curves, quality=quality, target_method=target_method)


def compute_curve(
    measured_axis: np.ndarray,
    input_axis: np.ndarray,
    *,
    method: CurveMethod,
    sample_count: int = 256,
) -> CurveResult:
    """Calcula una curva 1D de 0..255 que compensa la respuesta medida."""

    desired = np.linspace(0, 255, sample_count)
    if method == "pchip":
        model = PchipInterpolator(measured_axis, input_axis, extrapolate=True)
        samples = model(desired)
    elif method == "spline":
        smoothing = max(len(measured_axis) * 0.5, 1.0)
        model = UnivariateSpline(measured_axis, input_axis, k=min(3, len(measured_axis) - 1), s=smoothing)
        samples = model(desired)
    elif method == "linear":
        model = interp1d(
            measured_axis,
            input_axis,
            kind="linear",
            bounds_error=False,
            fill_value=_linear_extrapolation_fill(measured_axis, input_axis),
        )
        samples = model(desired)
    elif method == "polynomial":
        degree = min(3, len(measured_axis) - 1)
        coefficients = np.polyfit(measured_axis, input_axis, degree)
        samples = np.polyval(coefficients, desired)
    else:
        raise ValueError(f"Metodo de curva no soportado: {method}")

    raw_samples = np.asarray(samples, dtype=np.float64)
    clipped_fraction = _plateau_fraction(raw_samples)
    extrapolated = clipped_fraction > 0.02
    if extrapolated:
        raw_samples = _extrapolate_curve_tail(raw_samples)

    safe_samples = enforce_curve_bounds(raw_samples, rescale_endpoints=True)
    return CurveResult(
        method=method,
        samples=safe_samples,
        anchor_points=select_anchor_points(safe_samples),
        clipped_fraction=clipped_fraction,
        extrapolated_tail=extrapolated,
    )


def prepare_inverse_points(
    input_values: Iterable[float],
    measured_values: Iterable[float],
    *,
    measurement_polarity: MeasurementPolarity = "cyanotype_negative",
) -> tuple[np.ndarray, np.ndarray, MeasurementQuality]:
    """Normaliza mediciones y produce pares densidad->input para invertir.

    En cianotipo se imprime un negativo: mas tinta en el negativo bloquea mas UV
    y deja el papel mas claro. Por eso la luminosidad escaneada se transforma a
    densidad tonal con `255 - L` antes de calcular la curva.
    """

    inputs = np.asarray(list(input_values), dtype=np.float64)
    measured = np.asarray(list(measured_values), dtype=np.float64)
    if inputs.shape != measured.shape:
        raise ValueError("input_values y measured_values deben tener la misma longitud.")
    if inputs.size < 4:
        raise ValueError("Se requieren al menos cuatro mediciones para calcular una curva.")

    raw_span = float(np.max(measured) - np.min(measured))
    measured_density = _normalize_measured_density(measured, measurement_polarity)
    inputs = np.clip(inputs, 0, 255)
    input_order = np.argsort(inputs)
    inputs_by_input = inputs[input_order]
    measured_by_input = measured_density[input_order]

    empastado_patches = _count_empastado_patches(inputs_by_input, measured_by_input)
    inputs_by_input, measured_by_input, plateau_tail = _trim_tail_plateau_by_input(
        inputs_by_input,
        measured_by_input,
    )

    order = np.argsort(measured_by_input)
    measured_density = measured_by_input[order]
    inputs = inputs_by_input[order]

    unique_measured, inverse_indices = np.unique(np.rint(measured_density), return_inverse=True)
    averaged_inputs = np.zeros_like(unique_measured, dtype=np.float64)
    for index in range(len(unique_measured)):
        averaged_inputs[index] = float(np.mean(inputs[inverse_indices == index]))

    if unique_measured.size < 4:
        raise ValueError("Las mediciones no tienen suficiente rango tonal util.")

    measured_axis = unique_measured.astype(np.float64)
    input_axis = np.clip(averaged_inputs, 0, 255)
    measured_axis, input_axis, extrapolated_plateau = _extrapolate_measurement_plateau(measured_axis, input_axis)
    if plateau_tail is None:
        plateau_tail = extrapolated_plateau
    quality = _build_measurement_quality(
        n_patches=int(inputs.size),
        n_unique_measured=int(unique_measured.size),
        raw_luminance_span=raw_span,
        empastado_patches=empastado_patches,
        plateau_tail_measured=plateau_tail,
    )
    return measured_axis, input_axis, quality


def rank_curve_computations(
    computations: Iterable[CurveComputation],
) -> list[dict[str, object]]:
    """Ordena targets/curvas por cantidad y calidad de datos medidos."""

    ranked: list[dict[str, object]] = []
    for item in computations:
        best_math = _recommended_curve_method(item.curves)
        ranked.append(
            {
                "target_method": item.target_method,
                "data_score": round(item.quality.data_score, 1),
                "n_patches": item.quality.n_patches,
                "n_unique_measured": item.quality.n_unique_measured,
                "empastado_patches": item.quality.empastado_patches,
                "raw_luminance_span": round(item.quality.raw_luminance_span, 1),
                "plateau_tail_measured": item.quality.plateau_tail_measured,
                "warnings": list(item.quality.warnings),
                "recommended_math_method": best_math[0],
                "math_methods": {
                    name: {
                        "clipped_fraction": round(curve.clipped_fraction, 3),
                        "extrapolated_tail": curve.extrapolated_tail,
                    }
                    for name, curve in sorted(item.curves.items())
                },
            }
        )
    ranked.sort(
        key=lambda row: (
            -float(row["data_score"]),
            -int(row["n_unique_measured"]),
            -int(row["n_patches"]),
        )
    )
    for index, row in enumerate(ranked, start=1):
        row["rank"] = index
    return ranked


def enforce_curve_bounds(
    samples: Iterable[float],
    *,
    rescale_endpoints: bool = True,
) -> np.ndarray:
    """Limita a 0..255 y fuerza monotonicidad ascendente."""

    array = np.asarray(list(samples), dtype=np.float64)
    array = np.nan_to_num(array, nan=0.0, posinf=255.0, neginf=0.0)
    array = np.clip(array, 0, 255)
    array = np.maximum.accumulate(array)
    if rescale_endpoints and array[-1] > array[0]:
        array = (array - array[0]) / (array[-1] - array[0]) * 255
    array[0] = 0.0
    array[-1] = 255.0
    return np.clip(array, 0, 255)


def select_anchor_points(samples: Iterable[float], *, max_points: int = 13) -> tuple[tuple[int, int], ...]:
    """Reduce una curva de 256 samples a puntos compatibles con ACV."""

    array = enforce_curve_bounds(samples)
    indices = np.rint(np.linspace(0, len(array) - 1, max_points)).astype(int)
    points = [(int(round(array[index])), int(index)) for index in indices]
    points[0] = (int(round(array[0])), 0)
    points[-1] = (int(round(array[-1])), 255)
    return tuple(points)


def _count_empastado_patches(inputs: np.ndarray, measured_density: np.ndarray) -> int:
    """Cuenta parches donde el input avanza pero la medicion casi no cambia."""

    count = 0
    for index in range(1, len(inputs)):
        input_delta = inputs[index] - inputs[index - 1]
        measured_delta = abs(measured_density[index] - measured_density[index - 1])
        if input_delta >= _INPUT_STEP_MIN and measured_delta <= _EMPASTADO_MEASURED_EPS:
            count += 1
    return count


def _trim_tail_plateau_by_input(
    inputs: np.ndarray,
    measured_density: np.ndarray,
    *,
    min_tail_transitions: int = 2,
) -> tuple[np.ndarray, np.ndarray, float | None]:
    """Recorta una meseta al final del target antes de invertir la medicion."""

    if len(inputs) < min_tail_transitions + 2:
        return inputs, measured_density, None

    tail_start = len(inputs)
    for index in range(len(inputs) - 1, 0, -1):
        input_delta = inputs[index] - inputs[index - 1]
        measured_delta = abs(measured_density[index] - measured_density[index - 1])
        if input_delta >= _INPUT_STEP_MIN and measured_delta <= _EMPASTADO_MEASURED_EPS:
            tail_start = index
            continue
        break

    if len(inputs) - tail_start < min_tail_transitions:
        return inputs, measured_density, None
    if tail_start < 4:
        return inputs, measured_density, None

    plateau_tail = float(measured_density[tail_start])
    return inputs[:tail_start], measured_density[:tail_start], plateau_tail


def _extrapolate_measurement_plateau(
    measured_axis: np.ndarray,
    input_axis: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, float | None]:
    """Recorta colas empastadas y extrapola linealmente hasta (255, 255)."""

    measured = np.asarray(measured_axis, dtype=np.float64)
    inputs = np.clip(np.asarray(input_axis, dtype=np.float64), 0, 255)
    last_reliable = _last_reliable_index(measured, inputs)
    plateau_tail: float | None = None

    if last_reliable >= len(measured) - 2:
        ensured = _ensure_measurement_endpoints(measured, inputs)
        return ensured[0], ensured[1], plateau_tail

    plateau_tail = float(measured[last_reliable + 1])
    anchor_measured = measured[: last_reliable + 1]
    anchor_inputs = inputs[: last_reliable + 1]
    slope = _safe_slope(anchor_measured, anchor_inputs)

    tail_measured = np.linspace(float(anchor_measured[-1]), 255.0, 10)[1:]
    tail_inputs = anchor_inputs[-1] + slope * (tail_measured - anchor_measured[-1])
    merged_measured = np.concatenate([anchor_measured, tail_measured])
    merged_inputs = np.concatenate([anchor_inputs, tail_inputs])
    measured_out, inputs_out = _ensure_measurement_endpoints(merged_measured, merged_inputs)
    return measured_out, inputs_out, plateau_tail


def _last_reliable_index(measured: np.ndarray, inputs: np.ndarray) -> int:
    last_reliable = 0
    for index in range(1, len(measured)):
        measured_delta = measured[index] - measured[index - 1]
        input_delta = inputs[index] - inputs[index - 1]
        if measured_delta >= _MEASURED_STEP_MIN:
            last_reliable = index
            continue
        if input_delta >= _INPUT_STEP_MIN:
            break
        if inputs[index] >= 254.0 and inputs[index - 1] >= 254.0:
            break
    return last_reliable


def _recommended_curve_method(curves: dict[str, CurveResult]) -> tuple[str, CurveResult]:
    """Elige el metodo mas robusto; polynomial queda como comparacion."""

    preferred_order = {"pchip": 0, "spline": 1, "linear": 2, "polynomial": 10}
    return min(
        curves.items(),
        key=lambda pair: (
            preferred_order.get(pair[0], 9),
            pair[1].clipped_fraction,
            pair[0],
        ),
    )


def _safe_slope(measured: np.ndarray, inputs: np.ndarray) -> float:
    if len(measured) < 2:
        return 1.0
    dm = float(measured[-1] - measured[-2])
    di = float(inputs[-1] - inputs[-2])
    if abs(dm) >= 1.0:
        return di / dm
    dm = float(measured[-1] - measured[0])
    di = float(inputs[-1] - inputs[0])
    if abs(dm) < 1.0:
        return 1.0
    return di / dm


def _ensure_measurement_endpoints(
    measured: np.ndarray,
    inputs: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    measured = np.clip(measured, 0, 255)
    inputs = np.clip(inputs, 0, 255)
    points: list[tuple[float, float]] = [(0.0, 0.0)]
    for m_value, i_value in zip(measured, inputs, strict=True):
        if m_value <= 0.0 or i_value <= 0.0:
            continue
        if m_value >= 255.0 and i_value >= 255.0:
            continue
        points.append((float(m_value), float(i_value)))
    points.append((255.0, 255.0))
    points.sort(key=lambda item: item[0])

    deduped: list[tuple[float, float]] = []
    for m_value, i_value in points:
        if deduped and abs(m_value - deduped[-1][0]) < 0.5:
            deduped[-1] = (m_value, max(deduped[-1][1], i_value))
        else:
            deduped.append((m_value, i_value))

    measured_out = np.array([item[0] for item in deduped], dtype=np.float64)
    inputs_out = np.maximum.accumulate(np.array([item[1] for item in deduped], dtype=np.float64))
    return measured_out, inputs_out


def _extrapolate_curve_tail(samples: np.ndarray, *, saturation_threshold: float = 253.5) -> np.ndarray:
    """Extrapola la cola de la curva cuando ya esta pegada al techo antes de x=255."""

    array = np.asarray(samples, dtype=np.float64).copy()
    flat_start = len(array) - 1
    for index in range(len(array) - 2, 0, -1):
        if array[index] < saturation_threshold:
            flat_start = index
            break

    if flat_start >= len(array) - 8:
        array[-1] = 255.0
        return array

    lookback = max(0, flat_start - 24)
    x0, x1 = lookback, flat_start
    y0, y1 = array[x0], array[x1]
    if x1 <= x0 or y1 <= y0:
        array[-1] = 255.0
        return array

    slope = (y1 - y0) / (x1 - x0)
    for index in range(flat_start + 1, len(array)):
        array[index] = min(y1 + slope * (index - x1), 255.0)
    array[-1] = 255.0
    return array


def _plateau_fraction(samples: np.ndarray, *, tolerance: float = 0.25) -> float:
    diffs = np.diff(np.asarray(samples, dtype=np.float64))
    if diffs.size == 0:
        return 0.0
    return float(np.mean(diffs <= tolerance))


def _linear_extrapolation_fill(measured_axis: np.ndarray, input_axis: np.ndarray) -> tuple[float, float]:
    slope = _safe_slope(measured_axis, input_axis)
    low = float(input_axis[0] - slope * measured_axis[0])
    high = float(input_axis[-1] + slope * (255.0 - measured_axis[-1]))
    return (max(low, 0.0), min(high, 255.0))


def _build_measurement_quality(
    *,
    n_patches: int,
    n_unique_measured: int,
    raw_luminance_span: float,
    empastado_patches: int,
    plateau_tail_measured: float | None,
) -> MeasurementQuality:
    warnings: list[str] = []
    uniqueness = n_unique_measured / max(n_patches, 1)
    empastado_ratio = empastado_patches / max(n_patches - 1, 1)
    span_score = min(raw_luminance_span / 180.0, 1.0)

    if empastado_patches > 0:
        warnings.append(
            f"{empastado_patches} parche(s) con tonos empastados "
            "(el input avanza pero la medicion casi no cambia)."
        )
    if plateau_tail_measured is not None:
        warnings.append(
            f"Cola empastada detectada desde densidad ~{plateau_tail_measured:.0f}; "
            "se extrapolo linealmente hasta el blanco."
        )
    if uniqueness < 0.55:
        warnings.append("Pocos tonos unicos respecto al numero de parches; la curva sera menos fiable.")
    if raw_luminance_span < 90:
        warnings.append("Rango luminoso del escaneo muy comprimido; revisa exposicion o escaneo sin auto-contraste.")

    data_score = 100.0 * (
        0.35 * min(n_unique_measured / 256.0, 1.0)
        + 0.25 * uniqueness
        + 0.25 * span_score
        + 0.15 * max(0.0, 1.0 - empastado_ratio * 2.0)
    )
    return MeasurementQuality(
        n_patches=n_patches,
        n_unique_measured=n_unique_measured,
        raw_luminance_span=raw_luminance_span,
        empastado_patches=empastado_patches,
        plateau_tail_measured=plateau_tail_measured,
        data_score=round(data_score, 2),
        warnings=tuple(warnings),
    )


def _normalize_to_byte_range(values: np.ndarray) -> np.ndarray:
    minimum = float(np.min(values))
    maximum = float(np.max(values))
    if np.isclose(minimum, maximum):
        raise ValueError("Las mediciones tienen rango tonal cero.")
    return (values - minimum) / (maximum - minimum) * 255


def _normalize_measured_density(values: np.ndarray, polarity: MeasurementPolarity) -> np.ndarray:
    normalized = _normalize_to_byte_range(values)
    if polarity == "cyanotype_negative":
        return 255 - normalized
    if polarity == "positive":
        return normalized
    raise ValueError(f"Polaridad de medicion no soportada: {polarity}")
