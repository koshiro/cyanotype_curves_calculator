import json

from cyano_curve.reports import compare_ranking_reports


def test_compare_ranking_reports_calculates_round_deltas(tmp_path):
    before = tmp_path / "before.json"
    after = tmp_path / "after.json"
    before.write_text(
        json.dumps(
            {
                "ranking": [
                    {
                        "target_method": "pdn_31",
                        "n_unique_measured": 18,
                        "data_score": 36.6,
                        "raw_luminance_span": 33.0,
                        "empastado_patches": 7,
                        "recommended_math_method": "pchip",
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    after.write_text(
        json.dumps(
            {
                "ranking": [
                    {
                        "target_method": "pdn_31",
                        "n_unique_measured": 21,
                        "data_score": 44.7,
                        "raw_luminance_span": 107.0,
                        "empastado_patches": 5,
                        "recommended_math_method": "pchip",
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    comparison = compare_ranking_reports(before, after)
    row = comparison["comparisons"][0]

    assert row["delta_unique_tones"] == 3
    assert row["delta_score"] == 8.1
    assert row["delta_luminance_span"] == 74.0
    assert row["delta_empastado_patches"] == -2
