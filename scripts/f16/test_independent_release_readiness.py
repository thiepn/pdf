"""F16 synthetic adversarial signature, source-chain and original recovery contracts."""
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

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization

import independent_release_readiness as readiness
import verify_f15_original as original

NOW = datetime(2026, 10, 10, 16, 0, tzinfo=timezone.utc)
HEAD = "c" * 40


def synthetic_key():
    key = Ed25519PrivateKey.generate()
    public = key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw, format=serialization.PublicFormat.Raw).hex()
    return key, public


def signed(key, payload):
    return base64.b64encode(key.sign(readiness.f13.canonical(payload))).decode("ascii")


class IndependentRestoreContracts(unittest.TestCase):
    def setUp(self):
        root = TemporaryDirectory()
        self.addCleanup(root.cleanup)
        self.root = Path(root.name)
        self.data = self.root / "evidence"
        self.data.mkdir()
        self.manifest = {}
        for name in readiness.f15.FILES:
            body = b"%PDF-1.7\noriginal stable synthetic" if name in ("priorStable", "restoredStable") else (name + ": synthetic fixture").encode()
            filename = name + ".bin"
            (self.data / filename).write_bytes(body)
            self.manifest[name] = {"path": filename, "sha256": hashlib.sha256(body).hexdigest()}
        self.stable = self.manifest["priorStable"]["sha256"]
        self.backup = self.manifest["encryptedBackup"]["sha256"]
        self.keys = {}
        self.trust = {}
        for number in (1, 2):
            key, public = synthetic_key()
            identity = f"recovery-operator-{number}"
            self.keys[identity] = key
            self.trust[identity] = {"role": "recovery_operator", "publicKey": public,
                                    "grantedAt": datetime(2026, 10, 9, tzinfo=timezone.utc),
                                    "revoked": False}

    def ceremony(self, identity: str, kind: str, **edits):
        number = 1 if kind == "restoration" else 2
        payload = {"schemaVersion": 1, "kind": kind,
                   "f15SourceSha": readiness.F15_SHA, "f16SourceSha": HEAD,
                   "stableSha256": self.stable, "encryptedBackupSha256": self.backup,
                   "restoreTranscriptSha256": self.manifest["restoreTranscript"]["sha256"],
                   "rollbackTranscriptSha256": self.manifest["rollbackTranscript"]["sha256"],
                   "issuedAt": "2026-10-10T12:00:00Z", "expiresAt": "2026-10-11T10:00:00Z",
                   "nonce": format(number, "02x") * 16, "counter": 1,
                   "claim": "OBSERVATION_ONLY"}
        payload.update(edits)
        return {"signerId": identity, "payload": payload,
                "signature": signed(self.keys[identity], payload)}

    def examine(self, records, trust=None, stable=None, backup=None):
        return readiness.assess_recovery_ceremonies(
            self.trust if trust is None else trust, records, self.data,
            self.manifest, HEAD, self.stable if stable is None else stable,
            self.backup if backup is None else backup, NOW)

    def test_no_trust_or_human_evidence_remains_no_go(self):
        report = readiness.review({}, {}, [], [], self.data, HEAD, NOW)
        self.assertEqual(report["operatorTrust"], "NOT_CONFIGURED")
        self.assertEqual(len(report["humanRequirementsOpen"]), 9)
        self.assertFalse(report["authorizedToMerge"])
        self.assertFalse(report["authorizedToDeploy"])
        self.assertEqual(report["releaseDecision"], "NO_GO")

    def test_two_valid_synthetic_recovery_claims_never_prove_restore(self):
        states = self.examine([self.ceremony("recovery-operator-1", "restoration"),
                               self.ceremony("recovery-operator-2", "rollback")])
        self.assertEqual(states["issues"], [])
        self.assertEqual(states["missingCeremonies"], [])
        self.assertEqual(len(states["signedCeremonies"]), 2)
        self.assertTrue(states["originalStableByteEquality"])
        self.assertFalse(states["actualRestoreWitnessAccepted"])
        self.assertFalse(states["priorStableRecoveryProven"])
        self.assertFalse(states["authorizedToRollback"])

    def test_external_prior_stable_pin_required(self):
        with self.assertRaisesRegex(ValueError, "digest pin"):
            self.examine([], stable="f"*64)

    def test_external_encrypted_backup_pin_required(self):
        with self.assertRaisesRegex(ValueError, "digest pin"):
            self.examine([], backup="a"*64)

    def test_restore_must_match_previous_stable_bytes(self):
        new = b"unrelated restored artifact"
        (self.data / "restoredStable.bin").write_bytes(new)
        self.manifest["restoredStable"]["sha256"] = hashlib.sha256(new).hexdigest()
        with self.assertRaisesRegex(ValueError, "differ"):
            self.examine([])

    def test_missing_or_tampered_restore_transcript_rejected(self):
        (self.data / "restoreTranscript.bin").unlink()
        with self.assertRaises((ValueError, FileNotFoundError)):
            self.examine([])

    def test_reused_recovery_signer_for_both_events_rejected(self):
        states = self.examine([self.ceremony("recovery-operator-1", "restoration"),
                               self.ceremony("recovery-operator-1", "rollback")])
        self.assertTrue(states["issues"])
        self.assertEqual(len(states["signedCeremonies"]), 1)

    def test_signer_revocation_blocks_recovery(self):
        trust = {k: dict(v) for k,v in self.trust.items()}
        trust["recovery-operator-1"]["revoked"] = True
        state = self.examine([self.ceremony("recovery-operator-1", "restoration")], trust=trust)
        self.assertTrue(state["issues"])

    def test_role_substitution_blocks_recovery(self):
        trust = {k: dict(v) for k,v in self.trust.items()}
        trust["recovery-operator-1"]["role"] = "release_operator"
        state = self.examine([self.ceremony("recovery-operator-1", "restoration")], trust=trust)
        self.assertTrue(state["issues"])

    def test_replay_and_compromised_signature_fail_closed(self):
        record = self.ceremony("recovery-operator-1", "restoration", nonce="not-valid")
        self.assertTrue(self.examine([record])["issues"])
        record = self.ceremony("recovery-operator-1", "restoration")
        record["signature"] = base64.b64encode(b"\\x00" * 64).decode()
        self.assertTrue(self.examine([record])["issues"])

    def test_stale_f15_or_f16_sha_rejected(self):
        self.assertTrue(self.examine([self.ceremony("recovery-operator-1", "restoration", f16SourceSha="b"*40)])["issues"])
        self.assertTrue(self.examine([self.ceremony("recovery-operator-1", "restoration", f15SourceSha="a"*40)])["issues"])

    def test_forged_claim_authorizing_deployment_rejected(self):
        record = self.ceremony("recovery-operator-1", "restoration", claim="EXECUTE_RESTORE_NOW")
        self.assertTrue(self.examine([record])["issues"])

    def test_missing_ceremony_stays_unqualified(self):
        state = self.examine([self.ceremony("recovery-operator-1", "restoration")])
        self.assertEqual(state["missingCeremonies"], ["rollback"])
        self.assertFalse(state["actualRestoreWitnessAccepted"])

    def test_no_unapproved_release_when_partial_authority_supplied(self):
        with self.assertRaisesRegex(ValueError, "Partial"):
            readiness.review(self.trust, {}, [], [], self.data, HEAD, NOW, self.stable, self.backup)

    def test_review_rejects_invalid_source_head(self):
        with self.assertRaisesRegex(ValueError, "Exact"):
            readiness.review({}, {}, [], [], self.data, "invalid", NOW)


class OriginalF15EvidenceTests(unittest.TestCase):
    def archive(self, mutate=None):
        source = {
            "schemaVersion": 1, "f15ImplementationSha": original.F15_SOURCE_SHA,
            "originalF14Sha": original.prior_source.F14_SOURCE_SHA,
            "originalF14Run": original.prior_source.F14_RUN_ID,
            "originalF14ArtifactId": original.prior_source.F14_ARTIFACT_ID,
            "originalF14ArchiveSha256": "a"*64,
            "originalF13Sha": original.prior_source.inherited.F13_SHA,
            "originalF12Sha": original.operator.F12_SHA,
            "originalF11Sha": original.prior_source.inherited.f13_source.F11_SHA,
            "authenticatedIndependentSourceChain": True,
            "recordedHumanAcceptances": 0, "operatorRootProvided": False,
            "humanRequirementsOpen": list(original.operator.ROLE_REQUIREMENTS),
            "releaseDecision": "NO_GO", "authorizedToMerge": False, "authorizedToDeploy": False,
        }
        decision = {
            "schemaVersion": 1, "f15ImplementationSha": original.F15_SOURCE_SHA,
            "f14SourceSha": original.prior_source.F14_SOURCE_SHA,
            "operatorTrustStatus": "NOT_CONFIGURED",
            "humanRequirementsOpen": list(original.operator.ROLE_REQUIREMENTS),
            "operatorReviewStagesCryptographicallyVerified": [],
            "evidenceObjectsStructurallyVerified": [], "issues": [],
            "independentOperatorReviewEligible": False,
            "genuinePhysicalAcceptanceRecorded": False,
            "postreleaseClosureAccepted": False,
            "releaseDecision": "NO_GO", "authorizedToMerge": False, "authorizedToDeploy": False,
        }
        if mutate:
            mutate(source,decision)
        stream=io.BytesIO()
        with zipfile.ZipFile(stream, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("f15-source-provenance/authenticated-f14-original.json",json.dumps(source))
            z.writestr("f15-independent-owner/no-go.json",json.dumps(decision))
        return stream.getvalue()

    def test_expected_F15_archive_preserves_nine_open_requirements(self):
        out=original.verify_original_bytes(self.archive())
        self.assertEqual(len(out["humanRequirementsOpen"]),9)

    def test_forged_owner_authorization_is_rejected(self):
        def change(source,decision):
            decision["authorizedToDeploy"]=True
        with self.assertRaisesRegex(ValueError,"nonexistent operator"):
            original.verify_original_bytes(self.archive(change))

    def test_forged_postrelease_closure_rejected(self):
        def change(source,decision):
            decision["postreleaseClosureAccepted"]=True
        with self.assertRaisesRegex(ValueError,"nonexistent operator"):
            original.verify_original_bytes(self.archive(change))

    def test_missing_human_requirement_rejected(self):
        def change(source,decision):
            source["humanRequirementsOpen"].pop()
        with self.assertRaisesRegex(ValueError,"source chain"):
            original.verify_original_bytes(self.archive(change))

    def test_no_authenticated_service_digest_fails_closed(self):
        with patch.object(original.github,"api_json",side_effect=[
            {"id":original.F15_RUN_ID,"name":original.F15_RUN_NAME,
             "head_sha":original.F15_SOURCE_SHA,"status":"completed","conclusion":"success"},
            {"artifacts":[{"id":original.F15_ARTIFACT_ID,"name":original.F15_ARTIFACT_NAME,
                           "expired":False,"digest":None}]}
        ]):
            with TemporaryDirectory() as directory:
                with self.assertRaisesRegex(ValueError,"authenticated ZIP digest"):
                    original.authenticate_source("synthetic-fixture-token",HEAD,Path(directory)/"report.json")


if __name__ == "__main__":
    unittest.main()
