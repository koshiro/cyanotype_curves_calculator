import numpy as np

from cyano_curve.calculator import DEFAULT_METHODS, compute_all_curves, prepare_inverse_points


def test_prepare_inverse_points_normalizes_and_sorts_measurements():
    inputs = np.array([255, 0, 128, 64, 192])
    measured_lightness = 255 - np.array([100, 10, 55, 30, 80])

    measured_axis, input_axis, quality = prepare_inverse_points(inputs, measured_lightness)

    assert np.all(np.diff(measured_axis) > 0)
    assert np.all(np.diff(input_axis) >= 0)
    assert measured_axis[0] == 0
    assert measured_axis[-1] == 255
    assert quality.n_patches == 5


def test_all_curve_methods_are_256_samples_and_monotone():
    inputs = np.linspace(0, 255, 31)
    measured_lightness = 255 - (inputs / 255) ** 1.8 * 255

    result = compute_all_curves(inputs, measured_lightness)

    assert set(result.curves) == set(DEFAULT_METHODS)
    for curve in result.curves.values():
        assert curve.samples.shape == (256,)
        assert np.min(curve.samples) >= 0
        assert np.max(curve.samples) <= 255
        assert np.all(np.diff(curve.samples) >= -1e-9)
        assert 2 <= len(curve.anchor_points) <= 19
        assert curve.samples[0] == 0
        assert curve.samples[-1] == 255


def test_rank_curve_computations_prefers_more_unique_data():
    from cyano_curve.calculator import rank_curve_computations

    dense_inputs = np.linspace(0, 255, 51)
    dense_measured = 255 - (dense_inputs / 255) ** 1.4 * 255
    sparse_inputs = np.linspace(0, 255, 21)
    sparse_measured = 255 - (sparse_inputs / 255) ** 1.4 * 255

    dense = compute_all_curves(dense_inputs, dense_measured, target_method="chartthrob_51")
    sparse = compute_all_curves(sparse_inputs, sparse_measured, target_method="pdn_21")
    ranking = rank_curve_computations([sparse, dense])

    assert ranking[0]["target_method"] == "chartthrob_51"
    assert ranking[0]["rank"] == 1
    assert ranking[0]["recommended_math_method"] == "pchip"


def test_empastado_highlights_are_extrapolated_not_flattened():
    inputs = np.linspace(0, 255, 21)
    measured = 255 - np.concatenate(
        [
            (inputs[:12] / 255) ** 1.5 * 200,
            np.full(9, 200),
        ]
    )

    result = compute_all_curves(inputs, measured)
    curve = result.curves["pchip"]

    assert result.quality.empastado_patches > 0
    assert result.quality.plateau_tail_measured is not None
    assert curve.samples[-1] == 255
    assert np.argmax(curve.samples >= 254.5) >= 250
    assert np.mean(np.diff(curve.samples[200:])) > 0.5


def test_empastado_detection_uses_input_order_not_measured_order():
    inputs = np.array([0, 50, 100, 150, 200, 255], dtype=np.float64)
    density = np.array([0, 60, 120, 180, 181, 182], dtype=np.float64)
    measured_lightness = 255 - density

    result = compute_all_curves(inputs, measured_lightness)

    assert result.quality.empastado_patches == 2
    assert result.quality.plateau_tail_measured is not None
