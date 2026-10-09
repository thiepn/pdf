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


if __name__ == "__main__":
    unittest.main()
