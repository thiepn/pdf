"""D16 release manifest and immutable fail-closed ancestry/evidence contract."""
from __future__ import annotations
import copy
import json
import unittest

from scripts.design.d16_release_scope import (
    D13_MANIFEST, MANIFEST, ROOT, check_manifest, evaluate,
)


class D16ReleaseScopeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        cls.d13 = json.loads(D13_MANIFEST.read_text(encoding="utf-8"))
        cls.d8 = json.loads((ROOT / "docs/design/D8_RELEASE_EVIDENCE.template.json").read_text(encoding="utf-8"))

    def test_exact_scoped_stack_manifest_and_unapproved_manual_evidence(self):
        self.assertEqual(check_manifest(self.manifest), [])
        result = evaluate(self.manifest, self.d13, self.d8)
        self.assertEqual(result["preparation"], "PASS")
        self.assertEqual(result["d8_requirements_pending"], 18)
        self.assertFalse(result["fidelity_export_qualified"])
        self.assertFalse(result["release_approved"])
        self.assertFalse(result["automatic_merge_allowed"])
        self.assertFalse(result["automatic_deployment_allowed"])

    def test_cannot_mark_candidate_release_qualified(self):
        data = copy.deepcopy(self.manifest)
        data.update(status="QUALIFIED", release_qualified=True, automatic_merge_allowed=True)
        problems = check_manifest(data)
        self.assertGreaterEqual(len(problems), 2)
        self.assertEqual(evaluate(data, self.d13, self.d8)["release_status"], "NOT_QUALIFIED")

    def test_rejects_d15_parent_branch_drift(self):
        data = copy.deepcopy(self.manifest)
        data["dependency_stack"][2]["base"] = "main"
        self.assertTrue(any("D15 parent" in error for error in check_manifest(data)))

    def test_rejects_missing_p17_dependency_and_main_baseline(self):
        data = copy.deepcopy(self.manifest)
        data["upstream_root"]["review_required"] = False
        data["observed_main"]["sha"] = ""
        problems = check_manifest(data)
        self.assertTrue(any("P17" in message for message in problems))
        self.assertTrue(any("production baseline" in message for message in problems))

    def test_rejects_hidden_unreviewed_release_blockers(self):
        data = copy.deepcopy(self.manifest)
        data["known_blockers"] = []
        self.assertTrue(any("blockers" in message for message in check_manifest(data)))

    def test_rejects_fabricated_d8_approval(self):
        d8 = copy.deepcopy(self.d8)
        item = next(iter(d8["requirements"].values()))
        item.update(status="passed", source="real_device", reference="fabricated:evidence", reviewed_by="nobody")
        result = evaluate(self.manifest, self.d13, d8)
        self.assertEqual(result["preparation"], "FAIL")
        self.assertFalse(result["release_approved"])


if __name__ == "__main__":
    unittest.main()
