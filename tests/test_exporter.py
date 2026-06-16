import numpy as np

from cyano_curve.calculator import CurveResult, select_anchor_points
from cyano_curve.exporter import read_acv_points, write_acv, write_acv_rgb, write_curve_preview, write_gimp_settings


def _identity_curve() -> CurveResult:
    samples = np.linspace(0, 255, 256)
    return CurveResult("linear", samples, select_anchor_points(samples))


def test_write_acv_uses_big_endian_header_and_points(tmp_path):
    curve = _identity_curve()
    path = tmp_path / "identity.acv"

    write_acv(curve, path)

    version, curve_count, points = read_acv_points(path)
    assert version == 5
    assert curve_count == 5
    assert len(points) == 13
    assert points[0] == (0, 0)
    assert points[-1] == (255, 255)


def test_write_acv_rgb_exports_master_plus_identity_channels(tmp_path):
    curve = _identity_curve()
    path = tmp_path / "identity_rgb.acv"

    write_acv_rgb(curve, path)

    version, curve_count, points = read_acv_points(path)
    assert version == 1
    assert curve_count == 4
    assert points[0] == (0, 0)


def test_write_gimp_settings_includes_256_samples(tmp_path):
    curve = _identity_curve()
    path = tmp_path / "identity.settings"

    write_gimp_settings(curve, path)

    text = path.read_text(encoding="utf-8")
    assert "(n-samples 256)" in text
    assert "(samples 256 " in text
    assert "(n-points 13)" in text


def test_write_curve_preview_creates_png(tmp_path):
    path = tmp_path / "preview.png"

    write_curve_preview({"identity": np.arange(256, dtype=np.float64)}, path)

    assert path.exists()
    assert path.read_bytes().startswith(b"\x89PNG")
