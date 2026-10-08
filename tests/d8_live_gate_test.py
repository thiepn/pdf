import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("d8_live_gate", ROOT / "scripts/design/d8_live_gate.py")
gate = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gate)
TEMPLATE = ROOT / "docs/design/D8_RELEASE_EVIDENCE.template.json"

class D8GateTests(unittest.TestCase):
    def evidence(self):
        return json.loads(TEMPLATE.read_text(encoding="utf-8"))

    def test_all_18_requirements_start_pending(self):
        data = self.evidence()
        self.assertEqual(len(data["requirements"]), 18)
        self.assertTrue(all(row["status"] == "pending" for row in data["requirements"].values()))
        self.assertEqual(gate.evaluate(data, None)["status"], "NOT_QUALIFIED")

    def test_cannot_pass_from_demonstration_only(self):
        data = self.evidence()
        for row in data["requirements"].values():
            row.update(status="passed", source="prototype", reference="local browser mock screenshot", reviewed_by="automated")
        result = gate.evaluate(data, None)
        self.assertEqual(result["passed"], 0)
        self.assertEqual(result["status"], "NOT_QUALIFIED")

    def test_fake_full_evidence_cannot_bypass_checkout(self):
        data = self.evidence()
        for row in data["requirements"].values():
            row.update(status="passed", source="repo_ci", reference="https://github.com/thiepn/pdf/actions/12345", reviewed_by="reviewer")
        result = gate.evaluate(data, None)
        self.assertEqual(result["passed"], 18)
        self.assertIn("live checkout not supplied", result["blockers"])
        self.assertFalse(result["release_approved"])

    def test_missing_requirements_fail_closed(self):
        data = self.evidence()
        del data["requirements"]["p18_device_reader_qualified"]
        result = gate.evaluate(data, None)
        self.assertEqual(result["status"], "NOT_QUALIFIED")
        self.assertIn("requirement set incomplete or altered", result["blockers"])

if __name__ == "__main__":
    unittest.main()
