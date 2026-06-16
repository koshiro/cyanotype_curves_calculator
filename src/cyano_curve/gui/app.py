"""Punto de entrada de la GUI PySide6."""

from __future__ import annotations

import sys


def main(argv: list[str] | None = None) -> int:
    try:
        from PySide6.QtWidgets import QApplication
    except ModuleNotFoundError as exc:
        if exc.name == "PySide6":
            print(
                "PySide6 no esta instalado. Instala la GUI con:\n"
                '  .venv/bin/python -m pip install -e ".[gui]"\n'
                "Luego ejecuta:\n"
                "  .venv/bin/cyano-curve-gui",
                file=sys.stderr,
            )
            return 1
        raise

    from .main_window import MainWindow

    app = QApplication(argv or sys.argv)
    app.setApplicationName("Cyano Curve")
    window = MainWindow()
    window.resize(1120, 820)
    window.show()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
