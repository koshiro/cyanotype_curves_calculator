from cyano_curve.gui.app import main


def test_gui_entrypoint_without_pyside6_is_graceful():
    try:
        import PySide6  # noqa: F401
    except ModuleNotFoundError:
        assert main([]) == 1
    else:
        assert callable(main)
