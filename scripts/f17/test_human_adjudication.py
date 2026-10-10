"""F17 adversarial original-source and independently rooted human-claim contracts.

All keys are generated ephemerally in memory solely for test cases.
Tests do not approve physical devices, real identities or production release.
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

import adjudicate_human_acceptance as f17
import verify_f16_original as source

NOW = datetime(2026, 10, 10, 18, tzinfo=timezone.utc)
HEAD = "c" * 40


def keypair():
    key = Ed25519PrivateKey.generate()
    public = key.public_key().public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw).hex()
    return key, public


def sign(key, claim):
    return base64.b64encode(key.sign(f17.keys.canonical(claim))).decode("ascii")


class IndependentlyRootedIdentityCases(unittest.TestCase):
    def setUp(self):
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.evidence = self.root / "private-evidence"
        self.evidence.mkdir()
        self.root_key, self.root_pub = keypair()
        self.keys = {}
        self.trust = {}
        self.records = []
        self.ids = {}
        for number, (stage, (role, _phase)) in enumerate(f17.STAGES.items(), 1):
            key, public = keypair()
            key_id = "reviewer-" + str(number)
            person = "human-identity-" + str(number)
            content = ("synthetic record for " + key_id).encode()
            file = self.evidence / (key_id + ".bin")
            file.write_bytes(content)
            self.trust[key_id] = {"role": role, "publicKey": public,
                                  "grantedAt": datetime(2026, 10, 9, tzinfo=timezone.utc),
                                  "revoked": False}
            self.keys[key_id] = key
            self.ids[key_id] = person
            self.records.append({
                "personId": person, "signerId": key_id, "role": role,
                "publicKeySha256": hashlib.sha256(bytes.fromhex(public)).hexdigest(),
                "identityProofPath": file.name,
                "identityProofSha256": hashlib.sha256(content).hexdigest(),
                "status": "ACTIVE"
            })
        self.manifest_sha = "d" * 64

    def registry(self, records=None, predecessor="0"*64, sequence=1):
        unsigned = {
            "schemaVersion": 1, "f16SourceSha": f17.F16_SHA,
            "sequence": sequence, "previousSha256": predecessor,
            "issuedAt": "2026-10-10T12:00:00Z",
            "expiresAt": "2026-10-11T12:00:00Z",
            "members": records if records is not None else self.records,
        }
        root_signed = {**unsigned, "rootSignature": sign(self.root_key, unsigned)}
        file = self.root / "identities.json"
        file.write_bytes(f17.keys.canonical(root_signed))
        return file, hashlib.sha256(file.read_bytes()).hexdigest()

    def verify_registry(self, records=None, pinned=None, predecessor="0"*64, sequence=1):
        path, digest = self.registry(records, predecessor, sequence)
        return f17.verify_registry(path, pinned or digest, self.root_pub,
                                    predecessor, self.trust, self.evidence, NOW)

    def review(self, stage, source_sha=HEAD, signer_id=None, **edits):
        index = list(f17.STAGES).index(stage) + 1
        key_id = signer_id or "reviewer-" + str(index)
        phase = f17.STAGES[stage][1]
        payload = {
            "schemaVersion": 1, "stage": stage, "phase": phase,
            "f16SourceSha": f17.F16_SHA, "f17SourceSha": source_sha,
            "sourceManifestSha256": self.manifest_sha,
            "issuedAt": "2026-10-10T12:00:00Z",
            "expiresAt": "2026-10-11T10:00:00Z",
            "nonce": format(index, "02x") * 16,
            "counter": 1, "reviewDisposition": "REVIEWED_NOT_AUTHORIZED",
            "postreleaseReceiptSha256": "e" * 64 if phase == "POST_RELEASE" else None
        }
        payload.update(edits)
        return {"signerId": key_id, "payload": payload, "signature": sign(self.keys[key_id], payload)}

    def inspect(self, records):
        return f17.verify_review_requests(self.trust, self.verify_registry(),
                                          records, HEAD, self.manifest_sha, NOW)

    def test_unsigned_missing_human_evidence_yields_nine_open_and_no_go(self):
        out = f17.adjudicate({}, {}, [], [], {}, HEAD, NOW)
        self.assertEqual(len(out["humanRequirementsOpen"]), 9)
        self.assertEqual(out["releaseDecision"], "NO_GO")
        self.assertFalse(out["ownerGOAuthorized"])
        self.assertFalse(out["authorizedToMerge"])
        self.assertFalse(out["authorizedToDeploy"])
        self.assertEqual(out["technicallyVerifiedWitnessClaims"], [])

    def test_exact_root_signed_identity_registry_verifies_only_signer_claims(self):
        verified = self.verify_registry()
        self.assertEqual(verified, self.ids)

    def test_forged_external_registry_digest_denied(self):
        with self.assertRaisesRegex(ValueError, "external digest pin"):
            self.verify_registry(pinned="f" * 64)

    def test_untrusted_root_key_denied(self):
        path, digest = self.registry()
        _, other = keypair()
        with self.assertRaisesRegex(ValueError, "Ed25519"):
            f17.verify_registry(path, digest, other, "0"*64, self.trust, self.evidence, NOW)

    def test_registry_sequence_two_requires_external_predecessor(self):
        with self.assertRaisesRegex(ValueError, "continuity"):
            self.verify_registry(sequence=2)

    def test_identity_proof_bytes_changed_rejected(self):
        self.registry()
        (self.evidence / "reviewer-1.bin").write_bytes(b"fake")
        with self.assertRaisesRegex(ValueError, "bytes changed"):
            self.verify_registry()

    def test_identity_key_fingerprint_mismatch_rejected(self):
        rec = [dict(r) for r in self.records]
        rec[0]["publicKeySha256"] = "a" * 64
        with self.assertRaisesRegex(ValueError, "public-key fingerprint"):
            self.verify_registry(rec)

    def test_revocation_is_effective_even_for_root_signed_active_identity(self):
        self.trust["reviewer-1"]["revoked"] = True
        with self.assertRaisesRegex(ValueError, "Revoked"):
            self.verify_registry()

    def test_revoked_registry_identity_cannot_adjudicate(self):
        rec = [dict(r) for r in self.records]
        rec[0]["status"] = "REVOKED"
        valid = self.verify_registry(rec)
        self.assertNotIn("reviewer-1", valid)
        report = f17.verify_review_requests(self.trust, valid,
                                             [self.review("ownerPrecutoverReview")],
                                             HEAD, self.manifest_sha, NOW)
        self.assertTrue(report["issues"])

    def test_root_signed_duplicate_person_identity_denied(self):
        rec = [dict(r) for r in self.records]
        rec[1]["personId"] = rec[0]["personId"]
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            self.verify_registry(rec)

    def test_five_cryptographically_valid_reviews_still_never_authorize_go(self):
        reviews = [self.review(stage) for stage in f17.STAGES]
        output = self.inspect(reviews)
        self.assertEqual(output["issues"], [])
        self.assertEqual(len(output["technicallyVerifiedReviewClaims"]), 5)
        self.assertFalse(output["ownerGOAuthorized"])
        self.assertFalse(output["authorizedToDeploy"])
        prior = {"f16ImplementationSha": f17.F16_SHA, "releaseDecision": "NO_GO",
                 "authorizedToDeploy": False, "originalHumanPhysicalAcceptance": False}
        final = f17.adjudicate(self.trust, self.verify_registry(), reviews, [],
                                prior, HEAD, NOW, self.manifest_sha, self.evidence)
        self.assertEqual(len(final["humanRequirementsOpen"]), 9)
        self.assertFalse(final["realHumanIdentityAdjudicated"])
        self.assertFalse(final["actualPhysicalTestsConfirmed"])
        self.assertFalse(final["postreleaseClosureAccepted"])
        self.assertEqual(final["releaseDecision"], "NO_GO")

    def test_wrong_role_or_stale_implementation_source_denied(self):
        fake = self.review("ownerPrecutoverReview", signer_id="reviewer-2")
        self.assertTrue(self.inspect([fake])["issues"])
        stale = self.review("ownerPrecutoverReview", source_sha="b"*40)
        self.assertTrue(self.inspect([stale])["issues"])

    def test_postrelease_requires_original_receipt_digest_not_owner_release(self):
        no_receipt = self.review("independentPostreleaseReview", postreleaseReceiptSha256=None)
        self.assertTrue(self.inspect([no_receipt])["issues"])
        fake_go = self.review("ownerPrecutoverReview", reviewDisposition="AUTHORIZE_DEPLOY")
        self.assertTrue(self.inspect([fake_go])["issues"])

    def test_reused_signer_and_duplicate_independent_review_denied(self):
        first = self.review("ownerPrecutoverReview")
        second = self.review("ownerPrecutoverReview")
        self.assertTrue(self.inspect([first, second])["issues"])

    def test_tampered_review_signature_denied(self):
        fake = self.review("ownerPrecutoverReview")
        fake["signature"] = self.review("independentSecurityReview")["signature"]
        self.assertTrue(self.inspect([fake])["issues"])

    def test_expired_or_future_review_denied(self):
        old = self.review("ownerPrecutoverReview", expiresAt="2026-10-09T12:00:00Z")
        self.assertTrue(self.inspect([old])["issues"])
        future = self.review("ownerPrecutoverReview", issuedAt="2026-10-11T12:00:00Z")
        self.assertTrue(self.inspect([future])["issues"])

    def test_unsigned_witness_cannot_clear_original_human_gate(self):
        prior = {"f16ImplementationSha": f17.F16_SHA, "releaseDecision": "NO_GO",
                 "authorizedToDeploy": False, "originalHumanPhysicalAcceptance": False}
        counterfeit = {"reviewer": {"payload": {"requirement": "ios-safari-physical-device"}}}
        out = f17.adjudicate(self.trust, self.verify_registry(), [], [counterfeit],
                              prior, HEAD, NOW, self.manifest_sha, self.evidence)
        self.assertEqual(len(out["humanRequirementsOpen"]), 9)
        self.assertTrue(out["issues"])
        self.assertEqual(out["technicallyVerifiedWitnessClaims"], [])

    def test_unqualified_original_F16_recovery_claim_denied(self):
        with self.assertRaisesRegex(ValueError, "Prior source"):
            f17.adjudicate(self.trust, self.verify_registry(), [], [], {
                "f16ImplementationSha": f17.F16_SHA,
                "releaseDecision": "GO", "authorizedToDeploy": True,
            }, HEAD, NOW, self.manifest_sha, self.evidence)


class OriginalF16ByteCustodyCases(unittest.TestCase):
    def archive(self, mutator=None):
        chain = {
            "schemaVersion": 1,
            "f16ImplementationSha": source.F16_SHA,
            "originalF15Sha": source.parent.F15_SOURCE_SHA,
            "originalF15RunId": source.parent.F15_RUN_ID,
            "originalF15ArtifactId": source.parent.F15_ARTIFACT_ID,
            "originalF15ZipSha256": "a"*64,
            "originalF14Sha": source.parent.prior_source.F14_SOURCE_SHA,
            "originalF13Sha": source.parent.prior_source.inherited.F13_SHA,
            "originalF12Sha": source.f13.F12_SHA,
            "originalF11Sha": source.parent.prior_source.inherited.f13_source.F11_SHA,
            "originalSourceChainVerified": True, "originalHumanApprovals": 0,
            "humanWitnessesProvided": False, "productionOperatorKeysProvided": False,
            "uncollectedHumanRequirements": list(source.f13.ROLE_REQUIREMENTS),
            "releaseDecision": "NO_GO", "postreleaseClosureAccepted": False,
            "authorizedToMerge": False, "authorizedToDeploy": False,
        }
        packet = {
            "schemaVersion": 1, "f16ImplementationSha": source.F16_SHA,
            "f15OriginalSha": source.parent.F15_SOURCE_SHA,
            "operatorTrust": "NOT_CONFIGURED",
            "humanRequirementsOpen": list(source.f13.ROLE_REQUIREMENTS),
            "signatureClaimsChecked": 0, "independentRecoveryCeremonies": 0,
            "originalRecoveryBytesVerified": False,
            "originalHumanPhysicalAcceptance": False,
            "ownerReleaseAuthorized": False,
            "separatePostreleaseClosureAccepted": False,
            "issues": [], "releaseDecision": "NO_GO",
            "authorizedToMerge": False, "authorizedToDeploy": False,
        }
        if mutator:
            mutator(chain, packet)
        target = io.BytesIO()
        with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("f16-source/verified-f15-chain.json", json.dumps(chain))
            z.writestr("f16-operator/no-go.json", json.dumps(packet))
        return target.getvalue()

    def test_exact_original_member_inventory_and_missing_people(self):
        result = source.inspect_original(self.archive())
        self.assertEqual(len(result["humanRequirements"]), 9)

    def test_forged_original_owner_authorization_denied(self):
        def alter(chain, packet):
            packet["ownerReleaseAuthorized"] = True
        with self.assertRaisesRegex(ValueError, "altered"):
            source.inspect_original(self.archive(alter))

    def test_missing_original_human_requirement_denied(self):
        def alter(chain, packet):
            chain["uncollectedHumanRequirements"].pop()
        with self.assertRaisesRegex(ValueError, "forged human authority"):
            source.inspect_original(self.archive(alter))

    def test_reused_original_member_path_rejected(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr("f16-source/verified-f15-chain.json", "{}")
            z.writestr("f16-source/verified-f15-chain.json", "{}")
        with self.assertRaisesRegex(ValueError, "repeated"):
            source.inspect_original(buf.getvalue())

    def test_original_gitHub_artifact_digest_missing_denied(self):
        with patch.object(source.github, "api_json", side_effect=[
            {"id": source.F16_RUN, "name": source.F16_NAME,
             "head_sha": source.F16_SHA, "status": "completed", "conclusion": "success"},
            {"artifacts": [{"id": source.F16_ARTIFACT_ID,
                            "name": source.F16_ARTIFACT_NAME, "expired": False, "digest": None}]}
        ]):
            with TemporaryDirectory() as directory:
                with self.assertRaisesRegex(ValueError, "authentication failed"):
                    source.authenticate("synthetic-only", HEAD, Path(directory) / "report.json")


if __name__ == "__main__":
    unittest.main()
