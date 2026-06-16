import numpy as np

from cyano_curve.generator import (
    METHOD_STEPS,
    build_layout,
    generate_composite_target,
    generate_comparison_target,
    generate_corrected_target,
    generate_target,
    step_values,
)


def test_documented_methods_have_expected_step_counts():
    assert METHOD_STEPS["pdn_21"] == 21
    assert METHOD_STEPS["pdn_31"] == 31
    assert METHOD_STEPS["chartthrob_51"] == 51
    assert METHOD_STEPS["gradient_256"] == 256


def test_step_values_cover_full_byte_range():
    for method, expected_count in METHOD_STEPS.items():
        values = step_values(method)
        assert len(values) == expected_count
        assert int(values[0]) == 0
        assert int(values[-1]) == 255


def test_target_layout_matches_generated_image_size():
    image, layout = generate_target("chartthrob_51")

    assert image.size == (layout.width, layout.height)
    assert len(layout.patches) == 51
    assert len(layout.marker_centers) == 4
    assert layout == build_layout("chartthrob_51")


def test_composite_letter_target_contains_all_methods():
    image, layout = generate_composite_target()
    groups = {patch.method for patch in layout.patches}

    assert image.size == (2550, 3300)
    assert layout.method == "composite_letter"
    assert layout.marker_size == 80
    assert layout.marker_centers[0] == (160, 160)
    assert groups == {"pdn_21", "pdn_31", "chartthrob_51", "gradient_256"}
    assert len(layout.patches) == sum(METHOD_STEPS.values())


def test_corrected_target_stores_curve_outputs_as_layout_inputs():
    _, layout = generate_composite_target(methods=("pdn_21",))
    curve = np.clip(np.arange(256, dtype=np.float64) + 10, 0, 255)

    image, corrected_layout = generate_corrected_target(layout, curve)
    source_patch = layout.patches[3]
    corrected_patch = corrected_layout.patches[3]
    expected_value = int(curve[source_patch.input_value])
    x0, y0, _, _ = corrected_patch.box

    assert corrected_layout.method == "composite_letter_corrected"
    assert corrected_patch.input_value == expected_value
    assert image.getpixel((x0 + 2, y0 + 2)) == (expected_value, expected_value, expected_value)


def test_comparison_target_contains_base_and_corrected_groups():
    curve = np.clip(np.arange(256, dtype=np.float64) + 10, 0, 255)

    image, layout = generate_comparison_target(("pdn_21",), curve)
    groups = {patch.method for patch in layout.patches}
    base_patch = next(patch for patch in layout.patches if patch.method == "pdn_21_base" and patch.index == 3)
    corrected_patch = next(patch for patch in layout.patches if patch.method == "pdn_21_corrected" and patch.index == 3)
    expected_value = int(curve[base_patch.input_value])
    x0, y0, _, _ = corrected_patch.box

    assert image.size == (2550, 3300)
    assert layout.method == "comparison_letter"
    assert groups == {"pdn_21_base", "pdn_21_corrected"}
    assert corrected_patch.input_value == expected_value
    assert image.getpixel((x0 + 2, y0 + 2)) == (expected_value, expected_value, expected_value)
