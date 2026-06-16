import cv2
import numpy as np
from PIL import Image

from cyano_curve.calculator import CurveResult, select_anchor_points
from cyano_curve.exporter import write_gimp_settings
from cyano_curve.validation import analyze_validation_scan, write_validation_sheet


def _curve(samples: np.ndarray, method: str = "linear") -> CurveResult:
    return CurveResult(method, samples, select_anchor_points(samples))


def test_validation_sheet_generates_negative_grid_and_layout(tmp_path):
    image_path = tmp_path / "photo.png"
    curve_path = tmp_path / "identity.settings"
    output_path = tmp_path / "validation.png"

    Image.fromarray(np.tile(np.arange(256, dtype=np.uint8), (160, 1))).save(image_path)
    write_gimp_settings(_curve(np.arange(256, dtype=np.float64)), curve_path)

    layout = write_validation_sheet(image_path, [curve_path], output_path)
    sheet = Image.open(output_path).convert("L")
    tile = layout.tiles[0]
    first_wedge = tile.wedge_boxes[0]
    last_wedge = tile.wedge_boxes[-1]
    first_pixel = sheet.getpixel((first_wedge[0] + 4, first_wedge[1] + 4))
    last_pixel = sheet.getpixel((last_wedge[0] + 4, last_wedge[1] + 4))

    assert output_path.exists()
    assert len(layout.tiles) == 1
    assert first_pixel > last_pixel
    assert len(tile.wedge_boxes) == 21


def test_validation_scan_analysis_reports_metrics(tmp_path):
    image_path = tmp_path / "photo.png"
    curve_a = tmp_path / "identity.settings"
    curve_b = tmp_path / "soft.settings"
    sheet_path = tmp_path / "validation.png"
    report_layout_path = tmp_path / "validation.layout.json"

    image = np.tile(np.linspace(0, 255, 320, dtype=np.uint8), (240, 1))
    Image.fromarray(image).save(image_path)
    write_gimp_settings(_curve(np.arange(256, dtype=np.float64), "linear"), curve_a)
    write_gimp_settings(_curve(np.sqrt(np.arange(256, dtype=np.float64) / 255) * 255, "spline"), curve_b)
    write_validation_sheet(image_path, [curve_a, curve_b], sheet_path, layout_path=report_layout_path)

    target = np.asarray(Image.open(sheet_path).convert("L")).astype(np.float32)
    luminance = 70 + (255 - target) / 255.0 * 165
    cyano = np.stack([luminance * 0.72, luminance * 0.86, luminance], axis=2)
    cyano = cv2.GaussianBlur(cyano, (5, 5), 0)
    scan_path = tmp_path / "scan.png"
    Image.fromarray(np.clip(cyano, 0, 255).astype(np.uint8)).save(scan_path)

    report = analyze_validation_scan(scan_path, report_layout_path)

    assert len(report["tiles"]) == 2
    for tile in report["tiles"]:
        assert tile["wedge_range"] > 200
        assert tile["monotonic_violations"] == 0
        assert tile["wedge_rmse"] >= 0
