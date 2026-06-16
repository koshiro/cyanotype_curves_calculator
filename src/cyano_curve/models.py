"""Modelos de datos compartidos por el calibrador."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
import json
from typing import Any


@dataclass(frozen=True)
class Patch:
    """Parche de calibracion dentro del target generado."""

    index: int
    input_value: int
    box: tuple[int, int, int, int]
    method: str = ""


@dataclass(frozen=True)
class TargetLayout:
    """Descripcion serializable del target para medir el escaneo."""

    method: str
    width: int
    height: int
    rows: int
    columns: int
    patch_size: int
    gap: int
    margin: int
    marker_size: int
    marker_centers: tuple[tuple[float, float], ...]
    patches: tuple[Patch, ...]

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["marker_centers"] = [list(center) for center in self.marker_centers]
        data["patches"] = [
            {
                "index": patch.index,
                "input_value": patch.input_value,
                "box": list(patch.box),
                "method": patch.method,
            }
            for patch in self.patches
        ]
        return data

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "TargetLayout":
        return cls(
            method=str(data["method"]),
            width=int(data["width"]),
            height=int(data["height"]),
            rows=int(data["rows"]),
            columns=int(data["columns"]),
            patch_size=int(data["patch_size"]),
            gap=int(data["gap"]),
            margin=int(data["margin"]),
            marker_size=int(data["marker_size"]),
            marker_centers=tuple(tuple(map(float, center)) for center in data["marker_centers"]),
            patches=tuple(
                Patch(
                    index=int(patch["index"]),
                    input_value=int(patch["input_value"]),
                    box=tuple(map(int, patch["box"])),
                    method=str(patch.get("method", data["method"])),
                )
                for patch in data["patches"]
            ),
        )


def save_layout(layout: TargetLayout, path: str | Path) -> None:
    Path(path).write_text(json.dumps(layout.to_dict(), indent=2), encoding="utf-8")


def load_layout(path: str | Path) -> TargetLayout:
    return TargetLayout.from_dict(json.loads(Path(path).read_text(encoding="utf-8")))
