"""D13 manifest and release-policy unit tests; requires no browser or account."""
import copy
import json
import unittest
from pathlib import Path

from scripts.design.d13_integration_preflight import MANIFEST, evaluate, validate_manifest

ROOT = Path(__file__).resolve().parents[1]


class D13IntegrationPreflightTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads((ROOT / MANIFEST).read_text(encoding="utf-8"))

    def test_candidate_contract_is_complete_and_pinned(self):
        self.assertEqual(validate_manifest(self.manifest), [])
        self.assertEqual(len(self.manifest["phases"]), 12)
        self.assertEqual(len({r["commit_sha"] for r in self.manifest["phases"]}), 12)

    def test_real_source_mounted_and_release_refused(self):
        result = evaluate(self.manifest, ROOT, ancestors=False)
        self.assertEqual(result["integration_preflight"], "PASS", result["errors"])
        self.assertEqual(result["release_status"], "NOT_QUALIFIED")
        self.assertIs(result["automatic_deployment_allowed"], False)
        self.assertIs(result["release_approved"], False)

    def test_missing_phase_is_rejected(self):
        altered = copy.deepcopy(self.manifest)
        altered["phases"].pop(5)
        self.assertIn("expected precisely twelve phases", validate_manifest(altered))

    def test_equivalent_d5_replay_must_be_immutable_and_disclosed(self):
        original = self.manifest["phases"][4]["commit_sha"]
        replay = self.manifest["phases"][4]["equivalent_applied_commit_sha"]
        self.assertEqual(len(original), 40)
        self.assertEqual(len(replay), 40)
        self.assertNotEqual(original, replay)
        altered = copy.deepcopy(self.manifest)
        del altered["phases"][4]["equivalent_applied_commit_sha"]
        self.assertIn("phase 5: equivalent D6 replay SHA required", validate_manifest(altered))

    def test_base_branch_drift_is_rejected(self):
        altered = copy.deepcopy(self.manifest)
        altered["phases"][8]["base_branch"] = "main"
        self.assertIn("phase 9: broken stacked base relationship", validate_manifest(altered))

    def test_invented_release_permission_fails_closed(self):
        altered = copy.deepcopy(self.manifest)
        altered["release_qualified"] = True
        self.assertIn("candidate must explicitly prohibit automatic release", validate_manifest(altered))

    def test_p17_foundation_must_remain_disclosed(self):
        altered = copy.deepcopy(self.manifest)
        altered["root_dependency"]["review_required"] = False
        self.assertIn("missing P17 root dependency / review requirement", validate_manifest(altered))


if __name__ == "__main__":
    unittest.main()
