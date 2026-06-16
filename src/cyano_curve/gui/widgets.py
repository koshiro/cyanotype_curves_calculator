"""Widgets auxiliares para la GUI."""

from __future__ import annotations

from pathlib import Path
from typing import Callable

from PySide6.QtCore import Qt
from PySide6.QtGui import QPixmap
from PySide6.QtWidgets import (
    QApplication,
    QFileDialog,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QWidget,
)


class PathRow(QWidget):
    """Selector de ruta con caja de texto y boton de exploracion."""

    def __init__(
        self,
        label: str,
        *,
        mode: str = "open_file",
        file_filter: str = "Todos (*.*)",
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        self.mode = mode
        self.file_filter = file_filter
        self.edit = QLineEdit()
        self.button = QPushButton("Buscar")
        self.button.clicked.connect(self._browse)

        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(QLabel(label))
        layout.addWidget(self.edit, 1)
        layout.addWidget(self.button)

    def path(self) -> Path:
        return Path(self.edit.text()).expanduser()

    def set_path(self, path: str | Path) -> None:
        self.edit.setText(str(path))

    def _browse(self) -> None:
        if self.mode == "save_file":
            path, _ = QFileDialog.getSaveFileName(self, "Guardar", self.edit.text(), self.file_filter)
        elif self.mode == "directory":
            path = QFileDialog.getExistingDirectory(self, "Seleccionar carpeta", self.edit.text())
        else:
            path, _ = QFileDialog.getOpenFileName(self, "Abrir", self.edit.text(), self.file_filter)
        if path:
            self.edit.setText(path)


class PreviewLabel(QLabel):
    """Preview simple de una imagen generada."""

    def __init__(self) -> None:
        super().__init__("Sin preview")
        self.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.setMinimumHeight(260)
        self.setStyleSheet("border: 1px solid #777; background: #222; color: #ddd;")

    def show_image(self, path: str | Path) -> None:
        pixmap = QPixmap(str(path))
        if pixmap.isNull():
            self.setText("No se pudo cargar preview")
            self.setPixmap(QPixmap())
            return
        self.setPixmap(
            pixmap.scaled(
                self.width(),
                self.height(),
                Qt.AspectRatioMode.KeepAspectRatio,
                Qt.TransformationMode.SmoothTransformation,
            )
        )


def run_action(parent: QWidget, action: Callable[[], str | None]) -> None:
    QApplication.setOverrideCursor(Qt.CursorShape.WaitCursor)
    try:
        message = action()
    except Exception as exc:  # pragma: no cover - GUI error path.
        QMessageBox.critical(parent, "Error", str(exc))
        return
    finally:
        QApplication.restoreOverrideCursor()

    if message:
        QMessageBox.information(parent, "Listo", message)
