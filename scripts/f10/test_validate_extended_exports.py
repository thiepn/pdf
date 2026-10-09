"""F10 fail-closed corpus validation invariants."""
from __future__ import annotations
import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("f10_validator", Path(__file__).with_name("validate_extended_exports.py"))
assert SPEC and SPEC.loader
checker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(checker)


class ExtendedExportSafetyTests(unittest.TestCase):
    def test_missing_all_five_actual_browser_outputs_fails(self):
        with tempfile.TemporaryDirectory() as scratch:
            reports = [checker.validate_case(name, Path(scratch)) for name in checker.CASES]
        self.assertEqual(len(reports), 5)
        self.assertTrue(all(not report["passed"] for report in reports))
        self.assertTrue(all(any("output" in error for error in report["failures"]) for report in reports))

    def test_source_contains_genuine_form_and_measurement_semantics(self):
        from generate_export_corpus import main
        main()
        root = Path(__file__).resolve().parents[2] / "tests/corpus/f10"
        self.assertIn("contact.email", checker.form_profile(root / "forms.pdf"))
        measures = checker.measurement_profile(root / "comments-measurements.pdf")
        self.assertEqual(len(measures), 1)
        self.assertEqual(measures[0]["measure"]["/Subtype"], "/RL")

    def test_absent_independent_tool_cannot_pass(self):
        from generate_export_corpus import main
        main()
        root = Path(__file__).resolve().parents[2] / "tests/corpus/f10"
        with tempfile.TemporaryDirectory() as scratch:
            target = Path(scratch) / "optimization.pdf"
            target.write_bytes((root / "optimization.pdf").read_bytes())
            with patch.object(checker.independent, "run", side_effect=FileNotFoundError("qpdf missing")):
                report = checker.validate_case("optimization", Path(scratch))
        self.assertFalse(report["passed"])
        self.assertIn("FileNotFoundError", report["failures"][0])

    def test_unapproved_case_cannot_substitute_known_fixtures(self):
        with tempfile.TemporaryDirectory() as scratch:
            with self.assertRaisesRegex(ValueError, "Unapproved"):
                checker.validate_case("untrusted", Path(scratch))


if __name__ == "__main__":
    unittest.main()
