"""F11 requires independently verified actual exports from all three browsers."""
from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).parent
SPEC = importlib.util.spec_from_file_location("f11_validation", HERE / "validate_crossbrowser_exports.py")
assert SPEC and SPEC.loader
verifier = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(verifier)


class FailClosedTests(unittest.TestCase):
    def test_requires_three_real_browser_projects_and_seven_cases(self):
        self.assertEqual(verifier.PROJECTS, ("chromium", "firefox", "webkit"))
        self.assertEqual(len(verifier.F11_CASES) + len(verifier.f10.CASES), 7)

    def test_missing_exports_fail_for_all_browsers_and_cases(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            for browser in verifier.PROJECTS:
                result = verifier.validate_project(browser, path / "f10", path / "f11", path / "raster")
                self.assertFalse(result["passed"])
                self.assertEqual(len(result["cases"]), 7)
                self.assertTrue(all(not case["passed"] for case in result["cases"]))

    def test_browser_rectangle_drift_is_rejected(self):
        def result(browser: str, x: float):
            case_names = (*sorted(verifier.f10.ANNOTATION_EDIT_CASES), *verifier.F11_CASES)
            return {"browser": browser, "cases": [{"case": fixture, "passed": True,
                "newRectangle": {"centerX": x, "centerY": 0.5, "width": 0.1, "height": 0.1}}
                for fixture in case_names]}
        good = [result(name, 0.42) for name in verifier.PROJECTS]
        bad = [result("chromium", 0.42), result("firefox", 0.42), result("webkit", 0.81)]
        self.assertEqual(verifier.compare_browser_geometry(good), [])
        self.assertTrue(verifier.compare_browser_geometry(bad))

    def test_inset_and_rotated_visible_page_has_reader_crop_parity(self):
        import fitz
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "visible-inset-rotation.pdf"
            doc = fitz.open()
            page = doc.new_page(width=612, height=792)
            page.set_cropbox(fitz.Rect(50, 60, 520, 730))
            page.draw_rect(fitz.Rect(100, 120, 240, 260), color=(0, 0, 0), fill=(0, 0, 0))
            page.set_rotation(90)
            doc.save(source)
            doc.close()
            proof = verifier.render_profile(source, Path(directory) / "cropped")
        self.assertEqual(proof["poppler"]["width"], proof["mupdf"]["width"])
        self.assertEqual(proof["poppler"]["height"], proof["mupdf"]["height"])
        self.assertLessEqual(abs(proof["poppler"]["inkFraction"] - proof["mupdf"]["inkFraction"]), 0.08)

    def test_unknown_browser_cannot_replace_real_project(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError, "Unsupported browser"):
                verifier.validate_project("synthetic", Path(folder), Path(folder), Path(folder))

    def test_missing_external_raster_reader_cannot_pass(self):
        with tempfile.TemporaryDirectory() as folder:
            with patch.object(verifier.f9, "run", side_effect=FileNotFoundError("Poppler absent")):
                with self.assertRaises(FileNotFoundError):
                    verifier.render_profile(Path(folder) / "missing.pdf", Path(folder) / "proof")


if __name__ == "__main__":
    unittest.main()
