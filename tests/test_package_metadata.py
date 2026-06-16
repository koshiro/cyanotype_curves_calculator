from __future__ import annotations

import sys
from pathlib import Path

import pytest


if sys.version_info >= (3, 11):
    import tomllib
else:  # pragma: no cover - solo aplica a Python 3.10
    tomllib = pytest.importorskip("tomli")


def test_package_metadata_keeps_cli_and_optional_gui() -> None:
    pyproject = Path(__file__).resolve().parents[1] / "pyproject.toml"
    metadata = tomllib.loads(pyproject.read_text(encoding="utf-8"))

    project = metadata["project"]
    assert project["name"] == "cyano-curve"
    assert project["readme"] == "README.md"
    assert project["license"] == "MIT"
    assert project["license-files"] == ["LICENSE"]

    scripts = project["scripts"]
    assert scripts["cyano-curve"] == "cyano_curve.cli:main"
    assert scripts["cyano-curve-gui"] == "cyano_curve.gui.app:main"

    optional_dependencies = project["optional-dependencies"]
    assert "PySide6" in optional_dependencies["gui"]
    assert "pytest" in optional_dependencies["dev"]

    urls = project["urls"]
    assert urls["Repository"] == "https://github.com/koshiro/cyanotype_curves_calculator"
    assert urls["Issues"].endswith("/issues")
