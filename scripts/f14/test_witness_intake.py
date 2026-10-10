"""F14 adversarial synthetic tests for separate operator/witness signatures and custody.

In-memory fixture signers are not real human attestations or production keys.
"""
from __future__ import annotations

import base64
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
import zipfile

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

import witness_intake as intake
import verify_f13_original as source

NOW = datetime(2026, 10, 10, 14, 0, tzinfo=timezone.utc)
F14_HEAD = "a" * 40


def keypair():
    key = Ed25519PrivateKey.generate()
    public = key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw, format=serialization.PublicFormat.Raw).hex()
    return key, public


def sign(key, claim):
    return base64.b64encode(key.sign(intake.f13.canonical(claim))).decode("ascii")


class WitnessSecurityTests(unittest.TestCase):
    def setUp(self):
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.content = self.directory / "evidence"
        self.content.mkdir()
        (self.content / "android-session.bin").write_bytes(b"synthetic byte fixture, NOT a real physical witness")
        self.hash = hashlib.sha256((self.content / "android-session.bin").read_bytes()).hexdigest()
        self.owner_key, owner_public = keypair()
        self.witness_key, witness_public = keypair()
        self.trust = {
            "owner-one": {"role": "mobile_tester", "publicKey": owner_public,
                          "grantedAt": datetime(2026, 10, 9, tzinfo=timezone.utc), "revoked": False},
            "independent-witness": {"role": "release_operator", "publicKey": witness_public,
                                    "grantedAt": datetime(2026, 10, 9, tzinfo=timezone.utc), "revoked": False},
        }

    def receipt(self):
        payload = {
            "schemaVersion": 1,
            "requirement": "android-chrome-and-samsung-internet-physical-device",
            "f12SourceSha": intake.f13.F12_SHA,
            "f13SourceSha": intake.F13_SHA,
            "evidencePath": "android-session.bin",
            "evidenceSha256": self.hash,
            "issuedAt": "2026-10-10T12:00:00Z",
            "expiresAt": "2026-10-11T00:00:00Z",
            "nonce": "1a"*16,
            "counter": 1,
            "decision": "ACCEPT",
        }
        reviewer = {"signerId": "owner-one", "payload": payload,
                    "signature": sign(self.owner_key, payload)}
        claim = {
            "schemaVersion": 1, "requirement": payload["requirement"],
            "f13SourceSha": intake.F13_SHA, "f14SourceSha": F14_HEAD,
            "reviewerReceiptSha256": hashlib.sha256(intake.f13.canonical(reviewer)).hexdigest(),
            "evidenceSha256": self.hash,
            "method": "physical-android-browser",
            "sessionId": "SyntheticSession2026A",
            "witnessedAt": "2026-10-10T12:02:00Z",
            "nonce": "2b"*16, "counter": 1, "claim": "OBSERVED",
        }
        witness = {"signerId": "independent-witness", "payload": claim,
                   "signature": sign(self.witness_key, claim)}
        return {"schemaVersion": 1, "reviewer": reviewer, "witness": witness}

    def assess(self, *records):
        return intake.check_receipts(self.trust, list(records), self.content, F14_HEAD, NOW)

    def test_absent_trust_and_receipts_always_no_go(self):
        report = intake.check_receipts({}, [], self.content, F14_HEAD, NOW)
        self.assertEqual(len(report["missingHumanRequirements"]), 9)
        self.assertFalse(report["authorizedToMerge"])
        self.assertFalse(report["authorizedToDeploy"])
        self.assertEqual(report["releaseDecision"], "NO_GO")

    def test_two_valid_synthetic_signatures_are_not_human_approval(self):
        report = self.assess(self.receipt())
        self.assertEqual(report["issues"], [])
        self.assertEqual(len(report["cryptographicClaims"]), 1)
        self.assertEqual(len(report["missingHumanRequirements"]), 8)
        self.assertEqual(report["trustedHumanApprovalCount"], 0)
        self.assertFalse(report["actualWitnessedPhysicalApprovalsConfirmed"])
        self.assertEqual(report["releaseDecision"], "NO_GO")

    def test_missing_independent_witness_denied(self):
        record = self.receipt()
        record["witness"]["signerId"] = "unknown-key"
        self.assertTrue(self.assess(record)["issues"])

    def test_same_person_cannot_witness_own_claim(self):
        record = self.receipt()
        record["witness"]["signerId"] = record["reviewer"]["signerId"]
        self.assertTrue(self.assess(record)["issues"])

    def test_reviewer_or_witness_revoked_denied(self):
        record = self.receipt()
        self.trust["owner-one"]["revoked"] = True
        self.assertTrue(self.assess(record)["issues"])
        self.trust["owner-one"]["revoked"] = False
        self.trust["independent-witness"]["revoked"] = True
        self.assertTrue(self.assess(record)["issues"])

    def test_witness_role_separation_enforced(self):
        self.trust["independent-witness"]["role"] = "mobile_tester"
        self.assertTrue(self.assess(self.receipt())["issues"])

    def test_changed_evidence_bytes_denied(self):
        record = self.receipt()
        (self.content / "android-session.bin").write_bytes(b"modified")
        self.assertTrue(self.assess(record)["issues"])

    def test_review_claim_not_bound_to_witness_denied(self):
        record = self.receipt()
        record["witness"]["payload"]["reviewerReceiptSha256"] = "0"*64
        self.assertTrue(self.assess(record)["issues"])

    def test_signature_substitution_denied(self):
        record = self.receipt()
        record["witness"]["signature"] = record["reviewer"]["signature"]
        self.assertTrue(self.assess(record)["issues"])

    def test_signing_f13_head_instead_of_distinct_f14_head_denied(self):
        record = self.receipt()
        record["witness"]["payload"]["f14SourceSha"] = intake.F13_SHA
        self.assertTrue(self.assess(record)["issues"])

    def test_incorrect_device_method_denied(self):
        record = self.receipt()
        record["witness"]["payload"]["method"] = "physical-ios-safari"
        self.assertTrue(self.assess(record)["issues"])

    def test_future_claim_and_expired_receipt_denied(self):
        record = self.receipt()
        record["witness"]["payload"]["witnessedAt"] = "2026-10-20T20:00:00Z"
        self.assertTrue(self.assess(record)["issues"])
        record = self.receipt()
        record["reviewer"]["payload"]["expiresAt"] = "2026-10-09T20:00:00Z"
        self.assertTrue(self.assess(record)["issues"])

    def test_nonce_replay_and_duplicate_requirement_denied(self):
        a, b = self.receipt(), self.receipt()
        report = self.assess(a, b)
        self.assertTrue(report["issues"])
        self.assertEqual(len(report["cryptographicClaims"]), 1)

    def test_witness_session_id_must_be_unique_and_nontrivial(self):
        record = self.receipt()
        record["witness"]["payload"]["sessionId"] = "test"
        self.assertTrue(self.assess(record)["issues"])

    def test_evidence_symlink_or_traversal_denied(self):
        record = self.receipt()
        shortcut = self.content / "shortcut"
        shortcut.symlink_to(self.content / "android-session.bin")
        record["reviewer"]["payload"]["evidencePath"] = "shortcut"
        self.assertTrue(self.assess(record)["issues"])
        record = self.receipt()
        record["reviewer"]["payload"]["evidencePath"] = "../escape.bin"
        self.assertTrue(self.assess(record)["issues"])

    def test_missing_document_or_invalid_current_sha_denied(self):
        with self.assertRaisesRegex(ValueError, "Exact"):
            intake.check_receipts({}, [], self.content, "bad", NOW)
        with self.assertRaisesRegex(ValueError, "Receipt list"):
            intake.check_receipts({}, {}, self.content, F14_HEAD, NOW)

    def test_unsupported_evidence_type_does_not_create_approval(self):
        record = self.receipt()
        record["reviewer"]["payload"]["decision"] = "APPROVED_TO_DEPLOY"
        report = self.assess(record)
        self.assertTrue(report["issues"])
        self.assertFalse(report["authorizedToDeploy"])


class OriginalSourceEvidenceTests(unittest.TestCase):
    def original_archive(self, manipulation=None):
        chain = {
            "schemaVersion": 1, "F13ImplementationSha": source.F13_SHA,
            "F12SourceSha": source.operator.F12_SHA, "F11SourceSha": source.f13_source.F11_SHA,
            "originalF12Workflow": source.f13_source.F12_RUN,
            "originalF12ArtifactId": source.f13_source.F12_ARTIFACT,
            "originalF12ZipSha256": "f" * 64,
            "verifiedSourceCustody": True, "f12Integrity": True,
            "originalRunCount": 4, "originalArtifactCount": 5,
            "humanRequirementsOpen": 9, "releaseDecision": "NO_GO",
            "authorizedToDeploy": False,
        }
        no_go = {
            "sourceF13": source.F13_SHA, "sourceF12": source.operator.F12_SHA,
            "operatorTrust": "NOT_CONFIGURED", "humanPhysicalAcceptance": "OPEN",
            "releaseDecision": "NO_GO", "authorizedToMerge": False,
            "authorizedToDeploy": False, "eligibleForIndependentHumanReview": False,
            "issues": [], "cryptographicallyVerifiedRequirements": [],
            "uncollectedRequirements": list(source.operator.ROLE_REQUIREMENTS),
        }
        if manipulation:
            manipulation(chain, no_go)
        content = io.BytesIO()
        with zipfile.ZipFile(content, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("f13-original-source/f12-custody.json", json.dumps(chain))
            archive.writestr("f13-operator-decision/no-go.json", json.dumps(no_go))
        return content.getvalue()

    def test_original_f13_denial_packet_retains_source_chain(self):
        profile = source.load_original_zip(self.original_archive())
        self.assertEqual(profile["humanObligations"], 9)

    def test_rewritten_f13_sha_denied(self):
        def change(chain, decision):
            decision["sourceF13"] = "a"*40
        with self.assertRaisesRegex(ValueError, "forged"):
            source.load_original_zip(self.original_archive(change))

    def test_fake_human_approval_denied(self):
        def change(chain, decision):
            decision["operatorTrust"] = "APPROVED"
            decision["authorizedToDeploy"] = True
        with self.assertRaisesRegex(ValueError, "forged"):
            source.load_original_zip(self.original_archive(change))

    def test_extra_member_in_original_zip_denied(self):
        data = io.BytesIO()
        with zipfile.ZipFile(data, "w") as archive:
            archive.writestr("f13-original-source/f12-custody.json", "{}")
            archive.writestr("f13-operator-decision/no-go.json", "{}")
            archive.writestr("phantom", "untrusted")
        with self.assertRaisesRegex(ValueError, "unexpected"):
            source.load_original_zip(data.getvalue())

    def test_wrong_f12_source_archive_sha_denied_by_independent_check(self):
        with patch.object(source.github, "api_json", side_effect=[
            {"id": source.F13_RUN, "name": source.F13_WORKFLOW,
             "head_sha": source.F13_SHA, "status": "completed", "conclusion": "success"},
            {"artifacts": [{"id": source.F13_ARTIFACT, "name": source.F13_ARTIFACT_NAME,
                            "expired": False, "digest": "sha256:" +
                            hashlib.sha256(self.original_archive()).hexdigest()}]},
        ]), patch.object(source.github, "get_archive", return_value=self.original_archive()), \
                patch.object(source.f13_source, "authenticate_source",
                             return_value={"originalF12ZipSha256": "b"*64,
                                           "verifiedSourceCustody": True, "humanRequirementsOpen": 9}):
            with TemporaryDirectory() as directory:
                with self.assertRaisesRegex(ValueError, "diverged"):
                    source.authenticate_f13("synthetic-test-token", F14_HEAD,
                                             Path(directory) / "report.json")


if __name__ == "__main__":
    unittest.main()
