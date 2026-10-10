"""Adversarial Ed25519 trust, rotation, revocation and human-evidence denial tests.

Private keys in this file are ephemeral in-memory synthetic fixture keys only.
There are no embedded, provisioned or production operator credentials.
"""
from __future__ import annotations

import base64
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

import operator_release_evidence as rules

NOW = datetime(2026, 10, 10, 12, tzinfo=timezone.utc)
F13 = "a" * 40


def keypair():
    secret = Ed25519PrivateKey.generate()
    public = secret.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw).hex()
    return secret, public


def signature(key, payload):
    return base64.b64encode(key.sign(rules.canonical(payload))).decode("ascii")


class OfflineSignerTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.root_key, self.root_public = keypair()
        self.owner_key, self.owner_public = keypair()
        self.new_key, self.new_public = keypair()
        self.evidence_root = self.root / "evidence"
        self.evidence_root.mkdir()
        (self.evidence_root / "witness.pdf").write_bytes(b"%PDF-1.7\nSynthetic in-memory acceptance fixture\n")
        self.digest = hashlib.sha256((self.evidence_root / "witness.pdf").read_bytes()).hexdigest()
        self.grant = {"number": 1, "at": "2026-10-09T08:00:00Z", "kind": "grant", "keyId": "owner-key",
                      "role": "account_owner", "publicKey": self.owner_public}

    def trust(self, operations=None, sequence=1, previous="0"*64, pinned_previous=None):
        body = {"schemaVersion": 1, "sequence": sequence, "previousSha256": previous,
                "operations": operations if operations is not None else [self.grant]}
        record = {**body, "rootSignature": signature(self.root_key, body)}
        path = self.root / "trust.json"
        path.write_bytes(rules.canonical(record))
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        return rules.verify_trust_bundle(path, digest, self.root_public,
                                          previous if pinned_previous is None else pinned_previous, NOW)

    def envelope(self, signer_id="owner-key", key=None, **patch):
        payload = {"schemaVersion": 1, "requirement": "f8b-account-sso-authorization",
                   "f12SourceSha": rules.F12_SHA, "f13SourceSha": F13,
                   "evidencePath": "witness.pdf", "evidenceSha256": self.digest,
                   "issuedAt": "2026-10-10T09:00:00Z", "expiresAt": "2026-11-01T00:00:00Z",
                   "nonce": "9c"*16, "counter": 1, "decision": "ACCEPT"}
        payload.update(patch)
        return {"signerId": signer_id, "payload": payload,
                "signature": signature(key or self.owner_key, payload)}

    def assess(self, trust, records):
        return rules.assess_operator_packets(trust, records, self.evidence_root, F13, NOW)

    def test_missing_authority_never_issues_go(self):
        result = self.assess({}, [])
        self.assertEqual(len(result["uncollectedRequirements"]), 9)
        self.assertFalse(result["authorizedToDeploy"])
        self.assertFalse(result["authorizedToMerge"])
        self.assertEqual(result["releaseDecision"], "NO_GO")

    def test_valid_externally_pinned_signature_is_only_evidence_not_approval(self):
        result = self.assess(self.trust(), [self.envelope()])
        self.assertEqual(result["issues"], [])
        self.assertEqual(result["cryptographicallyVerifiedRequirements"], ["f8b-account-sso-authorization"])
        self.assertEqual(len(result["uncollectedRequirements"]), 8)
        self.assertEqual(result["humanPhysicalAcceptance"], "OPEN")
        self.assertEqual(result["releaseDecision"], "NO_GO")
        self.assertFalse(result["authorizedToDeploy"])

    def test_mutated_trust_bundle_digest_is_rejected(self):
        bundle = {"schemaVersion": 1, "sequence": 1, "previousSha256": "0"*64,
                  "operations": [self.grant]}
        (self.root / "trust.json").write_bytes(rules.canonical({**bundle, "rootSignature": signature(self.root_key, bundle)}))
        with self.assertRaisesRegex(ValueError, "pinned SHA256"):
            rules.verify_trust_bundle(self.root / "trust.json", "f"*64, self.root_public, "0"*64, NOW)

    def test_untrusted_root_fails_even_with_valid_digest(self):
        self.trust()
        _, other = keypair()
        path = self.root / "trust.json"
        with self.assertRaisesRegex(ValueError, "Ed25519"):
            rules.verify_trust_bundle(path, hashlib.sha256(path.read_bytes()).hexdigest(), other, "0"*64, NOW)

    def test_rotation_requires_cross_signature_and_retires_old_key(self):
        step = {"number": 2, "at": "2026-10-10T08:00:00Z", "kind": "rotate",
                "keyId": "owner-key", "newKeyId": "owner-v2", "newPublicKey": self.new_public}
        rotated = {**step, "crossSignature": signature(self.owner_key, step)}
        trust = self.trust([self.grant, rotated])
        self.assertTrue(trust["owner-key"]["revoked"])
        self.assertFalse(trust["owner-v2"]["revoked"])
        self.assertEqual(trust["owner-v2"]["role"], "account_owner")
        self.assertTrue(self.assess(trust, [self.envelope()])["issues"])
        self.assertEqual(self.assess(trust, [self.envelope("owner-v2", self.new_key)])["issues"], [])

    def test_rotation_signed_by_wrong_owner_is_rejected(self):
        step = {"number": 2, "at": "2026-10-10T08:00:00Z", "kind": "rotate",
                "keyId": "owner-key", "newKeyId": "owner-v2", "newPublicKey": self.new_public}
        rotated = {**step, "crossSignature": signature(self.new_key, step)}
        with self.assertRaisesRegex(ValueError, "Ed25519"):
            self.trust([self.grant, rotated])

    def test_revoked_new_key_rejects_all_claims(self):
        step = {"number": 2, "at": "2026-10-10T08:00:00Z", "kind": "rotate",
                "keyId": "owner-key", "newKeyId": "owner-v2", "newPublicKey": self.new_public}
        rotated = {**step, "crossSignature": signature(self.owner_key, step)}
        revoked = {"number": 3, "at": "2026-10-10T08:10:00Z", "kind": "revoke",
                   "keyId": "owner-v2", "reason": "Synthetic key compromise"}
        trust = self.trust([self.grant, rotated, revoked])
        self.assertTrue(self.assess(trust, [self.envelope("owner-v2", self.new_key)])["issues"])

    def test_fake_previous_hash_cannot_satisfy_rotation_continuity(self):
        with self.assertRaisesRegex(ValueError, "continuity pin"):
            self.trust(sequence=2, previous="1"*64, pinned_previous="2"*64)
        with self.assertRaisesRegex(ValueError, "predecessor"):
            self.trust(sequence=2, previous="0"*64)

    def test_missing_cryptographic_acceptance_fails_closed(self):
        record = self.envelope()
        record["signature"] = base64.b64encode(b"\0"*64).decode()
        self.assertTrue(self.assess(self.trust(), [record])["issues"])

    def test_forged_role_cannot_review_device(self):
        record = self.envelope(requirement="android-chrome-and-samsung-internet-physical-device")
        self.assertTrue(self.assess(self.trust(), [record])["issues"])

    def test_stale_head_and_modified_evidence_rejected(self):
        trust = self.trust()
        self.assertTrue(self.assess(trust, [self.envelope(f13SourceSha="b"*40)])["issues"])
        (self.evidence_root / "witness.pdf").write_bytes(b"tampered bytes")
        self.assertTrue(self.assess(trust, [self.envelope()])["issues"])

    def test_replayed_nonce_and_reused_signer_rejected(self):
        trust = self.trust()
        a = self.envelope()
        b = self.envelope(counter=2)
        self.assertTrue(self.assess(trust, [a, b])["issues"])

    def test_symlinked_witness_evidence_is_rejected(self):
        (self.evidence_root / "shortcut").symlink_to(self.evidence_root / "witness.pdf")
        self.assertTrue(self.assess(self.trust(), [self.envelope(evidencePath="shortcut")])["issues"])

    def test_duplicate_json_fields_rejected(self):
        with self.assertRaisesRegex(ValueError, "Duplicate JSON key"):
            rules.no_duplicates([("schemaVersion", 1), ("schemaVersion", 2)])

    def test_future_and_expired_operator_receipts_rejected(self):
        trust = self.trust()
        future = self.envelope(issuedAt="2026-10-11T12:00:00Z", expiresAt="2026-10-12T12:00:00Z")
        expired = self.envelope(expiresAt="2026-10-09T00:00:00Z")
        self.assertTrue(self.assess(trust, [future])["issues"])
        self.assertTrue(self.assess(trust, [expired])["issues"])


if __name__ == "__main__":
    unittest.main()
