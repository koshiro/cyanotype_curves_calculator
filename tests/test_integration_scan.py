import cv2
import numpy as np
from PIL import Image

from cyano_curve.calculator import compute_all_curves
from cyano_curve.extractor import extract_from_scan, extract_groups_from_scan
from cyano_curve.generator import generate_composite_target, generate_target


def test_generated_target_can_be_measured_after_blur_and_noise(tmp_path):
    image, layout = generate_target("pdn_21")
    target = np.asarray(image).astype(np.float32)
    gray = target[:, :, 0]

    # Simula cianotipo: lo oscuro del negativo queda claro en el papel.
    luminance = 70 + (255 - gray) / 255.0 * 165
    array = np.stack([luminance * 0.72, luminance * 0.86, luminance], axis=2)
    array = cv2.GaussianBlur(array, (5, 5), 0)
    rng = np.random.default_rng(42)
    array = np.clip(array + rng.normal(0, 1.5, array.shape), 0, 255).astype(np.uint8)

    scan_path = tmp_path / "scan.png"
    Image.fromarray(array).save(scan_path)

    measurements = extract_from_scan(scan_path, layout)
    result = compute_all_curves(measurements.input_values, measurements.measured_values)

    assert len(measurements.measured_values) == 21
    assert np.all(np.diff(measurements.measured_values) < 0)
    assert set(result.curves) == {"pchip", "spline", "linear", "polynomial"}


def test_composite_target_can_be_measured_by_method(tmp_path):
    image, layout = generate_composite_target(methods=("pdn_21", "chartthrob_51"))
    target = np.asarray(image).astype(np.float32)
    gray = target[:, :, 0]
    luminance = 70 + (255 - gray) / 255.0 * 165
    array = np.stack([luminance * 0.72, luminance * 0.86, luminance], axis=2)
    array = cv2.GaussianBlur(array, (5, 5), 0)
    array = np.clip(array, 0, 255).astype(np.uint8)

    scan_path = tmp_path / "composite_scan.png"
    Image.fromarray(array).save(scan_path)

    groups = extract_groups_from_scan(scan_path, layout)

    assert set(groups) == {"pdn_21", "chartthrob_51"}
    assert len(groups["pdn_21"].input_values) == 21
    assert len(groups["chartthrob_51"].input_values) == 51
    for measurements in groups.values():
        result = compute_all_curves(measurements.input_values, measurements.measured_values)
        assert set(result.curves) == {"pchip", "spline", "linear", "polynomial"}


def test_cyanotype_like_scan_with_light_markers_can_be_measured(tmp_path):
    image, layout = generate_composite_target(methods=("pdn_21", "chartthrob_51"))
    target = np.asarray(image).astype(np.float32)
    gray = target[:, :, 0]

    # En el cianotipo, las zonas negras del negativo bloquean UV y quedan claras.
    luminance = 70 + (255 - gray) / 255.0 * 165
    cyano = np.stack(
        [
            luminance * 0.72,
            luminance * 0.86,
            luminance,
        ],
        axis=2,
    )
    cyano = cv2.GaussianBlur(cyano, (5, 5), 0)
    cyano = np.clip(cyano, 0, 255).astype(np.uint8)

    scan_path = tmp_path / "cyanotype_scan.png"
    Image.fromarray(cyano).save(scan_path)

    groups = extract_groups_from_scan(scan_path, layout)

    assert set(groups) == {"pdn_21", "chartthrob_51"}
    assert len(groups["pdn_21"].measured_values) == 21
    assert len(groups["chartthrob_51"].measured_values) == 51
