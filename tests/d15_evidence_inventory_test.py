"""D15 release inventory tests: no fabricated approvals or skipped human gates."""
import copy
import json
import unittest
from pathlib import Path

from scripts.design.d15_evidence_inventory import (
    EXPECTED_REQUIREMENTS, TEMPLATE, audit_evidence,
)


class D15EvidenceInventoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.template = json.loads(Path(TEMPLATE).read_text(encoding="utf-8"))

    def test_all_eighteen_real_acceptance_items_remain_pending(self):
        result = audit_evidence(copy.deepcopy(self.template))
        self.assertEqual(result["pending"], 18)
        self.assertEqual(result["passed"], 0)
        self.assertTrue(result["inventory_valid"])
        self.assertFalse(result["release_qualified"])

    def test_an_unreviewed_approval_cannot_qualify_release(self):
        data = copy.deepcopy(self.template)
        name = next(iter(sorted(EXPECTED_REQUIREMENTS)))
        data["requirements"][name]["status"] = "passed"
        result = audit_evidence(data)
        self.assertFalse(result["inventory_valid"])
        self.assertFalse(result["release_qualified"])
        self.assertTrue(any("requires a D8-approved source" in issue for issue in result["problems"]))

    def test_missing_evidence_key_is_not_counted_as_approval(self):
        data = copy.deepcopy(self.template)
        name = next(iter(sorted(EXPECTED_REQUIREMENTS)))
        del data["requirements"][name]
        result = audit_evidence(data)
        self.assertFalse(result["inventory_valid"])
        self.assertEqual(result["pending"], 18)

    def test_premature_qualified_status_is_rejected(self):
        data = copy.deepcopy(self.template)
        data["status"] = "QUALIFIED"
        data["candidate_sha"] = "not-reviewed"
        result = audit_evidence(data)
        self.assertFalse(result["inventory_valid"])
        self.assertFalse(result["release_qualified"])

    def test_complete_human_review_records_are_only_review_ready_with_correct_status(self):
        data = copy.deepcopy(self.template)
        data["candidate_sha"] = "f" * 40
        for item in data["requirements"].values():
            item.update(status="passed", source="physical test", reference="artifact:verified", reviewed_by="Release Owner")
        # Still fail closed if a release owner did not explicitly qualify the candidate.
        result = audit_evidence(data)
        self.assertEqual(result["pending"], 0)
        self.assertTrue(result["inventory_valid"])
        self.assertFalse(result["release_qualified"])
        data["status"] = "QUALIFIED_FOR_REVIEW"
        self.assertTrue(audit_evidence(data)["ready_for_review"])
        self.assertFalse(audit_evidence(data)["release_qualified"])


if __name__ == "__main__":
    unittest.main()
