"""Utilidades para comparar reportes de calibracion."""

from __future__ import annotations

from pathlib import Path
import json
from typing import Any


def compare_ranking_reports(before_path: str | Path, after_path: str | Path) -> dict[str, Any]:
    before = _load_ranking(before_path)
    after = _load_ranking(after_path)
    before_by_target = {row["target_method"]: row for row in before}
    after_by_target = {row["target_method"]: row for row in after}

    targets = sorted(set(before_by_target) & set(after_by_target))
    comparisons = []
    for target in targets:
        old = before_by_target[target]
        new = after_by_target[target]
        comparisons.append(
            {
                "target_method": target,
                "before_unique_tones": old["n_unique_measured"],
                "after_unique_tones": new["n_unique_measured"],
                "delta_unique_tones": new["n_unique_measured"] - old["n_unique_measured"],
                "before_score": old["data_score"],
                "after_score": new["data_score"],
                "delta_score": round(new["data_score"] - old["data_score"], 1),
                "before_luminance_span": old["raw_luminance_span"],
                "after_luminance_span": new["raw_luminance_span"],
                "delta_luminance_span": round(new["raw_luminance_span"] - old["raw_luminance_span"], 1),
                "before_empastado_patches": old["empastado_patches"],
                "after_empastado_patches": new["empastado_patches"],
                "delta_empastado_patches": new["empastado_patches"] - old["empastado_patches"],
                "recommended_math_method": new["recommended_math_method"],
            }
        )

    comparisons.sort(
        key=lambda row: (
            -row["delta_unique_tones"],
            -row["delta_score"],
            row["after_empastado_patches"],
        )
    )
    return {
        "before": str(before_path),
        "after": str(after_path),
        "best_before": before[0] if before else None,
        "best_after": after[0] if after else None,
        "comparisons": comparisons,
    }


def write_report_comparison(before_path: str | Path, after_path: str | Path, output_path: str | Path) -> dict[str, Any]:
    comparison = compare_ranking_reports(before_path, after_path)
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(comparison, indent=2, ensure_ascii=False), encoding="utf-8")
    return comparison


def _load_ranking(path: str | Path) -> list[dict[str, Any]]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    ranking = data.get("ranking")
    if not isinstance(ranking, list):
        raise ValueError(f"El reporte no contiene una lista `ranking`: {path}")
    return ranking
