"""F15 adversarial owner/operator and postrelease closure cases.

Ephemeral signing keys are generated in memory ONLY as synthetic cryptography fixtures.
"""
from __future__ import annotations

import base64
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
import unittest
import zipfile

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

import reconcile_owner_release as f15
import verify_f14_original as source

NOW = datetime(2026, 10, 10, 16, 0, tzinfo=timezone.utc)
HEAD = "a" * 40


def keypair():
    key = Ed25519PrivateKey.generate()
    return key, key.public_key().public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw).hex()


def sign(key, claim):
    return base64.b64encode(key.sign(f15.trust_code.canonical(claim))).decode("ascii")


class IndependentOperatorReviewTests(unittest.TestCase):
    def setUp(self):
        temp = TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.evidence = self.root / "evidence"
        self.evidence.mkdir()
        self.trust = {}
        self.keys = {}
        for stage, required in f15.STAGES.items():
            key, public = keypair()
            signer_id = stage + "-fixture"
            self.keys[stage] = (key, signer_id)
            self.trust[signer_id] = {
                "role": required["role"], "publicKey": public,
                "grantedAt": datetime(2026, 10, 9, 0, 0, tzinfo=timezone.utc),
                "revoked": False,
            }
        self.manifest = {}
        for name in f15.FILES:
            data = (b"%PDF-1.7\nstable bytes" if name in ("priorStable", "restoredStable")
                    else ("SYNTHETIC " + name).encode())
            path = name + ".bin"
            (self.evidence / path).write_bytes(data)
            self.manifest[name] = {"path": path, "sha256": hashlib.sha256(data).hexdigest()}
        self.digest = hashlib.sha256(f15.trust_code.canonical(self.manifest)).hexdigest()

    def packet(self):
        moments = {
            "ownerReleaseReview": "2026-10-10T12:00:00Z",
            "independentOperatorReview": "2026-10-10T12:01:00Z",
            "postreleaseClosureReview": "2026-10-10T12:02:00Z",
        }
        decisions = {}
        for stage, required in f15.STAGES.items():
            key, signer_id = self.keys[stage]
            claim = {
                "schemaVersion": 1,
                "stage": stage, "claim": required["claim"],
                "f14SourceSha": f15.F14_SHA, "f15SourceSha": HEAD,
                "evidenceManifestSha256": self.digest, "issuedAt": moments[stage],
                "expiresAt": "2026-10-11T00:00:00Z",
                "nonce": format(len(decisions) + 1, "02x") * 16,
                "counter": 1,
            }
            decisions[stage] = {
                "signerId": signer_id, "claim": claim, "signature": sign(key, claim)
            }
        return {"schemaVersion": 1, "manifest": self.manifest, "decisions": decisions}

    def evaluate(self, packet=None):
        return f15.review_packet(self.trust, packet if packet is not None else self.packet(),
                                 [], self.evidence, HEAD, NOW)

    def test_three_valid_synthetic_signatures_never_grant_go(self):
        state = self.evaluate()
        self.assertEqual(state["issues"], [])
        self.assertEqual(len(state["operatorReviewStagesCryptographicallyVerified"]), 3)
        self.assertEqual(len(state["evidenceObjectsStructurallyVerified"]), 9)
        self.assertEqual(len(state["humanRequirementsOpen"]), 9)
        self.assertEqual(state["releaseDecision"], "NO_GO")
        self.assertFalse(state["authorizedToMerge"])
        self.assertFalse(state["authorizedToDeploy"])
        self.assertFalse(state["postreleaseClosureAccepted"])
        self.assertFalse(state["genuinePhysicalAcceptanceRecorded"])

    def test_absent_trust_returns_denied_evidence_not_false_pass(self):
        state = f15.review_packet({}, {}, [], self.evidence, HEAD, NOW)
        self.assertFalse(state["authorizedToDeploy"])
        self.assertEqual(state["releaseDecision"], "NO_GO")
        self.assertEqual(len(state["humanRequirementsOpen"]), 9)

    def test_missing_rollback_transcript_denied(self):
        packet = self.packet()
        del packet["manifest"]["rollbackTranscript"]
        self.assertTrue(self.evaluate(packet)["issues"])

    def test_changed_prior_stable_byte_digest_denied(self):
        packet = self.packet()
        (self.evidence / "priorStable.bin").write_bytes(b"tampered")
        self.assertTrue(self.evaluate(packet)["issues"])

    def test_restored_stable_does_not_match_previous_stable(self):
        packet = self.packet()
        restored = b"different restored bytes"
        (self.evidence / "restoredStable.bin").write_bytes(restored)
        packet["manifest"]["restoredStable"]["sha256"] = hashlib.sha256(restored).hexdigest()
        self.assertTrue(self.evaluate(packet)["issues"])

    def test_ciphertext_cannot_impersonate_previous_stable(self):
        packet = self.packet()
        data = (self.evidence / "priorStable.bin").read_bytes()
        (self.evidence / "encryptedBackup.bin").write_bytes(data)
        packet["manifest"]["encryptedBackup"]["sha256"] = hashlib.sha256(data).hexdigest()
        self.assertTrue(self.evaluate(packet)["issues"])

    def test_missing_external_reader_custody_denied(self):
        packet = self.packet()
        (self.evidence / "thirdPartyReaderWitness.bin").unlink()
        self.assertTrue(self.evaluate(packet)["issues"])

    def test_owner_and_operator_must_have_distinct_roles(self):
        packet = self.packet()
        id_ = packet["decisions"]["independentOperatorReview"]["signerId"]
        self.trust[id_]["role"] = "account_owner"
        self.assertTrue(self.evaluate(packet)["issues"])

    def test_owner_and_closure_identity_cannot_be_reused(self):
        packet = self.packet()
        packet["decisions"]["postreleaseClosureReview"]["signerId"] = (
            packet["decisions"]["ownerReleaseReview"]["signerId"])
        self.assertTrue(self.evaluate(packet)["issues"])

    def test_revoked_key_rejected(self):
        packet = self.packet()
        signer_id = packet["decisions"]["ownerReleaseReview"]["signerId"]
        self.trust[signer_id]["revoked"] = True
        self.assertTrue(self.evaluate(packet)["issues"])

    def test_signature_forgery_rejected(self):
        packet = self.packet()
        packet["decisions"]["ownerReleaseReview"]["signature"] = packet[
            "decisions"]["independentOperatorReview"]["signature"]
        self.assertTrue(self.evaluate(packet)["issues"])

    def test_attestation_on_previous_f15_source_rejected(self):
        packet = self.packet()
        packet["decisions"]["independentOperatorReview"]["claim"]["f15SourceSha"] = "b"*40
        self.assertTrue(self.evaluate(packet)["issues"])

    def test_closure_receipt_cannot_precede_release_owner_review(self):
        packet = self.packet()
        packet["decisions"]["postreleaseClosureReview"]["claim"]["issuedAt"] = "2026-10-10T10:00:00Z"
        key = self.keys["postreleaseClosureReview"][0]
        claim = packet["decisions"]["postreleaseClosureReview"]["claim"]
        packet["decisions"]["postreleaseClosureReview"]["signature"] = sign(key, claim)
        self.assertTrue(self.evaluate(packet)["issues"])

    def test_stale_and_replayed_nonces_rejected(self):
        packet = self.packet()
        operator = packet["decisions"]["independentOperatorReview"]["claim"]
        operator["nonce"] = packet["decisions"]["ownerReleaseReview"]["claim"]["nonce"]
        packet["decisions"]["independentOperatorReview"]["signature"] = sign(
            self.keys["independentOperatorReview"][0], operator)
        self.assertTrue(self.evaluate(packet)["issues"])

    def test_review_envelope_cannot_request_actual_release(self):
        packet = self.packet()
        claim = packet["decisions"]["ownerReleaseReview"]["claim"]
        claim["claim"] = "AUTHORIZE_DEPLOY"
        packet["decisions"]["ownerReleaseReview"]["signature"] = sign(
            self.keys["ownerReleaseReview"][0], claim)
        self.assertTrue(self.evaluate(packet)["issues"])

    def test_manifest_path_symlink_and_traversal_denied(self):
        packet = self.packet()
        symlink = self.evidence / "alias.bin"
        symlink.symlink_to(self.evidence / "priorStable.bin")
        packet["manifest"]["priorStable"]["path"] = "alias.bin"
        self.assertTrue(self.evaluate(packet)["issues"])
        packet = self.packet()
        packet["manifest"]["priorStable"]["path"] = "../other.bin"
        self.assertTrue(self.evaluate(packet)["issues"])


class SourceChainTests(unittest.TestCase):
    def archive(self, transform=None):
        chain = {
            "schemaVersion": 1, "f14ImplementationSha": source.F14_SOURCE_SHA,
            "originalF13Sha": source.inherited.F13_SHA,
            "verifiedF12OriginalSha": source.operator.F12_SHA,
            "verifiedF11OriginalSha": source.inherited.f13_source.F11_SHA,
            "originalF13Run": source.inherited.F13_RUN,
            "originalF13Artifact": source.inherited.F13_ARTIFACT,
            "originalF13ZipSha256": "f"*64,
            "sourceChainIntegrity": True, "operatorSignersProvided": 0,
            "humanRequirementsOpen": 9, "releaseDecision": "NO_GO",
            "authorizedToMerge": False, "authorizedToDeploy": False,
        }
        denial = {
            "schemaVersion": 1, "f14ImplementationSha": source.F14_SOURCE_SHA,
            "f13SourceSha": source.inherited.F13_SHA,
            "trustStatus": "NOT_CONFIGURED",
            "missingHumanRequirements": list(source.operator.ROLE_REQUIREMENTS),
            "cryptographicClaims": [], "issues": [], "trustedHumanApprovalCount": 0,
            "actualWitnessedPhysicalApprovalsConfirmed": False,
            "canSubmitForIndependentHumanReview": False,
            "releaseDecision": "NO_GO", "authorizedToMerge": False,
            "authorizedToDeploy": False,
        }
        if transform:
            transform(chain, denial)
        target = io.BytesIO()
        with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("f14-source-custody/verified-original-source.json", json.dumps(chain))
            archive.writestr("f14-intake/witnessed-no-go.json", json.dumps(denial))
        return target.getvalue()

    def test_original_f14_archive_contract(self):
        result = source.inspect_original_archive(self.archive())
        self.assertEqual(len(result["allHumanRequirementsOpen"]), 9)

    def test_missing_human_requirement_detected(self):
        def change(chain, denial):
            denial["missingHumanRequirements"].pop()
        with self.assertRaisesRegex(ValueError, "absent human"):
            source.inspect_original_archive(self.archive(change))

    def test_forged_real_approval_rejected(self):
        def change(chain, denial):
            denial["trustedHumanApprovalCount"] = 1
        with self.assertRaisesRegex(ValueError, "absent human"):
            source.inspect_original_archive(self.archive(change))

    def test_duplicate_untrusted_archive_entries_rejected(self):
        bundle = io.BytesIO()
        with zipfile.ZipFile(bundle, "w") as archive:
            archive.writestr("f14-intake/witnessed-no-go.json", "{}")
            archive.writestr("f14-intake/witnessed-no-go.json", "{}")
        with self.assertRaisesRegex(ValueError, "members changed"):
            source.inspect_original_archive(bundle.getvalue())

    def test_missing_authenticated_artifact_digest_rejected(self):
        with patch.object(source.github, "api_json", side_effect=[
            {"id": source.F14_RUN_ID, "name": source.F14_RUN_NAME,
             "head_sha": source.F14_SOURCE_SHA, "status": "completed", "conclusion": "success"},
            {"artifacts": [{"id": source.F14_ARTIFACT_ID, "name": source.F14_ARTIFACT_NAME,
                            "expired": False, "digest": None}]}
        ]):
            with TemporaryDirectory() as tmp:
                with self.assertRaisesRegex(ValueError, "identity/SHA256"):
                    source.authenticate_f14("synthetic-token", HEAD, Path(tmp)/"packet.json")


if __name__ == "__main__":
    unittest.main()
