"""F9 gate invariants: false success must be impossible."""
import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

MODULE_PATH = Path(__file__).with_name("validate_export_roundtrip.py")
spec = importlib.util.spec_from_file_location("f9_validator", MODULE_PATH)
assert spec and spec.loader
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)


class F9ValidationSafetyTests(unittest.TestCase):
    def test_missing_export_fails_even_when_case_has_valid_source(self):
        with tempfile.TemporaryDirectory() as scratch:
            report = validator.verify_case("rotated-crop", Path(scratch))
            self.assertFalse(report["passed"])
            self.assertTrue(any("Missing export" in error for error in report["failures"]))

    def test_missing_external_reader_cannot_be_reported_as_success(self):
        with tempfile.TemporaryDirectory() as scratch:
            folder = Path(scratch)
            edited = folder / "incremental-edited.pdf"
            edited.write_bytes(b"%PDF-1.7\n" + b"0" * 110)
            with patch.object(validator, "ROOT", folder), patch.object(
                validator, "run", side_effect=FileNotFoundError("qpdf missing")
            ):
                source = folder / "tests/corpus/p8/incremental.pdf"
                source.parent.mkdir(parents=True)
                source.write_bytes(b"%PDF-1.7\n" + b"0" * 110)
                report = validator.verify_case("incremental", folder)
            self.assertFalse(report["passed"])
            self.assertIn("FileNotFoundError", report["failures"][0])

    def test_missing_both_cases_fails_whole_report(self):
        with tempfile.TemporaryDirectory() as scratch:
            reports = [validator.verify_case(case, Path(scratch)) for case in validator.CASES]
            self.assertEqual(len(reports), 2)
            self.assertFalse(all(report["passed"] for report in reports))


    def test_rectangle_annotation_is_required_and_not_counted_as_data_loss(self):
        previous = {"/Subtype": "/Text", "/Rect": [2, 2, 8, 8], "/T": "Reviewer",
                    "renderableAppearance": True}
        added = {"/Subtype": "/Square", "/Rect": [10, 10, 60, 60], "/T": "PDF Studio",
                 "renderableAppearance": True}
        self.assertEqual(validator.compare_annotations([[previous]], [[previous, added]]), [])
        self.assertTrue(validator.compare_annotations([[previous]], [[previous]]))
        self.assertTrue(validator.compare_annotations([[previous]], [[added]]))
        self.assertTrue(validator.compare_annotations([[previous]], [[previous, added, added]]))

    def test_rectangle_requires_rendered_appearance_and_valid_bounds(self):
        square = {"/Subtype": "/Square", "/Rect": [10, 10, 50, 50],
                  "/T": "PDF Studio", "renderableAppearance": True}
        self.assertFalse(validator.compare_annotations([[]], [[square]]))
        self.assertTrue(validator.compare_annotations([[]], [[{**square, "renderableAppearance": False}]]))
        self.assertTrue(validator.compare_annotations([[]], [[{**square, "/Rect": [50, 10, 10, 50]}]]))
        self.assertTrue(validator.compare_annotations([[]], [[{**square, "/Subtype": "/Text"}]]))
        self.assertTrue(validator.compare_annotations([[]], [[{**square, "/T": "Untrusted"}]]))

    def test_non_edited_pages_cannot_gain_annotations(self):
        square = {"/Subtype": "/Square", "/Rect": [10, 10, 50, 50],
                  "/T": "PDF Studio", "renderableAppearance": True}
        self.assertTrue(validator.compare_annotations([[], []], [[square], [square]]))


if __name__ == "__main__":
    unittest.main()
