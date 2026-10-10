#!/usr/bin/env python3
"""F17 externally pinned operator-identity register and no-go adjudication.

This offline tool verifies signed *claims*, NOT whether people or hardware
existed. Genuine human acceptance has to occur under separate real-world
governance. No signed input can yield GO, deploy, merge or release closure.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "f13"))
import operator_release_evidence as keys
sys.path.insert(0, str(ROOT / "scripts" / "f14"))
import witness_intake as human
sys.path.insert(0, str(ROOT / "scripts" / "f16"))
import independent_release_readiness as recovery

F16_SHA = "cf2eca998ddb5807a9829d415092bdfe0cb5bb18"
STAGES = {
    "ownerPrecutoverReview": ("account_owner", "PRE_RELEASE"),
    "independentSecurityReview": ("security_reviewer", "PRE_RELEASE"),
    "independentAccessibilityReview": ("accessibility_reviewer", "PRE_RELEASE"),
    "independentRecoveryReview": ("recovery_operator", "PRE_RELEASE"),
    "independentPostreleaseReview": ("recovery_operator", "POST_RELEASE"),
}
REGISTRY_FIELDS = {"schemaVersion", "f16SourceSha", "sequence", "previousSha256",
                   "issuedAt", "expiresAt", "members", "rootSignature"}
MEMBER_FIELDS = {"personId", "signerId", "role", "publicKeySha256",
                 "identityProofPath", "identityProofSha256", "status"}
ADJUDICATION_FIELDS = {"schemaVersion", "stage", "phase", "f16SourceSha",
                       "f17SourceSha", "sourceManifestSha256", "issuedAt", "expiresAt",
                       "nonce", "counter", "reviewDisposition",
                       "postreleaseReceiptSha256"}


def verify_registry(registry_path: Path, pinned_registry_sha256: str,
                    external_root_public_key: str, pinned_predecessor_sha256: str,
                    trust: dict[str, dict[str, Any]], evidence_dir: Path,
                    now: datetime) -> dict[str, str]:
    """Only an externally pinned ROOT signature and blob digest admit identities.

    A rooted registry still does not mean a real person was independently
    identified. That is a separate OFF-CI approval boundary.
    """
    if (not isinstance(pinned_registry_sha256, str) or
            not keys.HEX64.fullmatch(pinned_registry_sha256) or
            not isinstance(pinned_predecessor_sha256, str) or
            not keys.HEX64.fullmatch(pinned_predecessor_sha256)):
        raise ValueError("Externally pinned identity registry/previous SHA256 required")
    if not registry_path.is_file() or registry_path.is_symlink():
        raise ValueError("Identity registry unavailable or symlinked")
    if hashlib.sha256(registry_path.read_bytes()).hexdigest() != pinned_registry_sha256:
        raise ValueError("Identity registry bytes differ from external digest pin")
    source = keys.read_json(registry_path)
    if set(source) != REGISTRY_FIELDS or source["schemaVersion"] != 1:
        raise ValueError("Malformed rooted identity registry")
    if source["f16SourceSha"] != F16_SHA or source["previousSha256"] != pinned_predecessor_sha256:
        raise ValueError("Identity register predecessor or original F16 SHA changed")
    if type(source["sequence"]) is not int or source["sequence"] < 1:
        raise ValueError("Invalid registry sequencing")
    if (source["sequence"] == 1 and pinned_predecessor_sha256 != "0"*64 or
            source["sequence"] > 1 and pinned_predecessor_sha256 == "0"*64):
        raise ValueError("Unanchored original identity register continuity")
    issued, expires = keys.time_value(source["issuedAt"]), keys.time_value(source["expiresAt"])
    if issued > now + timedelta(minutes=5) or expires <= now or expires > issued + timedelta(days=90):
        raise ValueError("Identity registry expired or future-issued")
    keys.verify_sig(external_root_public_key,
                    keys.canonical({k: v for k, v in source.items() if k != "rootSignature"}),
                    source["rootSignature"])
    members = source["members"]
    if not isinstance(members, list) or not 1 <= len(members) <= 64:
        raise ValueError("Identity member registry missing or oversized")
    person_ids: set[str] = set()
    seen_signers: set[str] = set()
    active: dict[str, str] = {}
    for member in members:
        if not isinstance(member, dict) or set(member) != MEMBER_FIELDS:
            raise ValueError("Malformed independently signed identity member")
        person_id, signer_id = member["personId"], member["signerId"]
        if (not isinstance(person_id, str) or not re.fullmatch(r"[a-z0-9][a-z0-9_.-]{7,63}", person_id) or
                not isinstance(signer_id, str) or person_id in person_ids or signer_id in seen_signers):
            raise ValueError("Duplicate/invalid signer or independent person identifier")
        person_ids.add(person_id)
        seen_signers.add(signer_id)
        known = trust.get(signer_id)
        if not isinstance(known, dict) or known["role"] != member["role"]:
            raise ValueError("Identity record role not anchored in independent signer trust")
        expected_key_sha = hashlib.sha256(bytes.fromhex(known["publicKey"])).hexdigest()
        if member["publicKeySha256"] != expected_key_sha:
            raise ValueError("Person identity conflicts with signer public-key fingerprint")
        if member["status"] not in ("ACTIVE", "REVOKED"):
            raise ValueError("Unsupported identity custody state")
        if member["status"] == "ACTIVE" and known["revoked"]:
            raise ValueError("Revoked or compromised signer cannot remain active")
        # Even REVOKED identities must retain their original receipt and bytes.
        keys.verify_evidence_file(evidence_dir, member["identityProofPath"], member["identityProofSha256"])
        if member["status"] == "ACTIVE":
            active[signer_id] = person_id
    return active


def verify_review_requests(trust: dict[str, dict[str, Any]],
                           registry: dict[str, str],
                           envelopes: list[dict[str, Any]],
                           f17_head: str, source_manifest_sha256: str,
                           now: datetime) -> dict[str, Any]:
    if not isinstance(f17_head, str) or not keys.HEX40.fullmatch(f17_head):
        raise ValueError("Exact current F17 SHA required")
    if not isinstance(source_manifest_sha256, str) or not keys.HEX64.fullmatch(source_manifest_sha256):
        raise ValueError("Independently authenticated manifest digest required")
    if not isinstance(envelopes, list) or len(envelopes) > len(STAGES):
        raise ValueError("Unexpected operator review count")
    verified: set[str] = set()
    actors: set[str] = set()
    persons: set[str] = set()
    nonces: set[str] = set()
    issues: list[str] = []
    for index, envelope in enumerate(envelopes, 1):
        try:
            if not isinstance(envelope, dict) or set(envelope) != {"signerId", "payload", "signature"}:
                raise ValueError("Invalid review envelope")
            signer_id = envelope["signerId"]
            if not isinstance(signer_id, str) or signer_id in actors or signer_id not in registry:
                raise ValueError("Reviewer not independently identified or key reused")
            person = registry[signer_id]
            if person in persons:
                raise ValueError("Same human identity attempted different review roles")
            signer = trust.get(signer_id)
            if not isinstance(signer, dict) or signer["revoked"]:
                raise ValueError("Revoked/untrusted reviewer")
            payload = envelope["payload"]
            if not isinstance(payload, dict) or set(payload) != ADJUDICATION_FIELDS:
                raise ValueError("Malformed signed review payload")
            stage = payload["stage"]
            if stage not in STAGES or stage in verified:
                raise ValueError("Duplicate/unsupported stage")
            role, phase = STAGES[stage]
            if signer["role"] != role or payload["phase"] != phase:
                raise ValueError("Signer lacks independent phase/role authority")
            if (payload["schemaVersion"] != 1 or payload["f16SourceSha"] != F16_SHA or
                    payload["f17SourceSha"] != f17_head or
                    payload["sourceManifestSha256"] != source_manifest_sha256 or
                    payload["reviewDisposition"] != "REVIEWED_NOT_AUTHORIZED"):
                raise ValueError("Review could not authorize release or is source-unbound")
            receipt = payload["postreleaseReceiptSha256"]
            if phase == "PRE_RELEASE" and receipt is not None:
                raise ValueError("Pre-release receipt cannot masquerade as postrelease observation")
            if phase == "POST_RELEASE" and (not isinstance(receipt, str) or not keys.HEX64.fullmatch(receipt)):
                raise ValueError("Postrelease review requires external original deployment receipt digest")
            issued, expires = keys.time_value(payload["issuedAt"]), keys.time_value(payload["expiresAt"])
            if (issued < signer["grantedAt"] or issued > now + timedelta(minutes=5)
                    or expires <= now or expires > issued + timedelta(days=30)):
                raise ValueError("Untrusted review chronology")
            nonce = payload["nonce"]
            if (not isinstance(nonce, str) or not re.fullmatch(r"[0-9a-f]{32,128}", nonce)
                    or nonce in nonces or type(payload["counter"]) is not int or payload["counter"] < 1):
                raise ValueError("Replay nonce or counter")
            keys.verify_sig(signer["publicKey"], keys.canonical(payload), envelope["signature"])
            verified.add(stage); actors.add(signer_id); persons.add(person); nonces.add(nonce)
        except (ValueError, TypeError, KeyError, OSError) as exc:
            issues.append(f"review {index}: {exc}")
    return {"technicallyVerifiedReviewClaims": sorted(verified),
            "missingIndependentReviewStages": sorted(set(STAGES) - verified),
            "issues": issues,
            "humanIdentitiesConfirmedOutsideOfCode": False,
            "postreleaseClosureAccepted": False,
            "ownerGOAuthorized": False, "authorizedToMerge": False, "authorizedToDeploy": False}


def adjudicate(trust: dict[str, dict[str, Any]],
               identity_registry: dict[str, str],
               reviews: list[dict[str, Any]],
               f16_witness_records: list[dict[str, Any]],
               original_recovery: dict[str, Any],
               f17_head: str, now: datetime,
               source_manifest_sha256: str | None = None,
               evidence_root: Path | None = None) -> dict[str, Any]:
    """Evidence receipt technical review; deliberately incapable of issuing GO."""
    if not isinstance(f17_head, str) or not keys.HEX40.fullmatch(f17_head):
        raise ValueError("Exact F17 implementation HEAD required")
    if not trust and not identity_registry and not reviews and not f16_witness_records and not original_recovery:
        return {"schemaVersion": 1, "f16OriginalSha": F16_SHA, "f17ImplementationSha": f17_head,
                "identityTrust": "NOT_CONFIGURED", "technicallyVerifiedReviewClaims": [],
                "humanRequirementsOpen": list(keys.ROLE_REQUIREMENTS), "technicallyVerifiedWitnessClaims": [],
                "originalRecoveryClaimStatus": "NOT_PROVIDED",
                "originalHumanWitnessCount": 0, "actualPhysicalTestsConfirmed": False,
                "realHumanIdentityAdjudicated": False, "ownerGOAuthorized": False,
                "postreleaseClosureAccepted": False, "releaseDecision": "NO_GO",
                "authorizedToMerge": False, "authorizedToDeploy": False, "issues": []}
    if not trust or not identity_registry or not isinstance(reviews, list) or not isinstance(f16_witness_records, list):
        raise ValueError("Partial human-identity or operator authority source is untrusted")
    if not isinstance(original_recovery, dict) or original_recovery.get("f16ImplementationSha") != F16_SHA:
        raise ValueError("Missing source-verified qualified F16 recovery evidence identity")
    if original_recovery.get("authorizedToDeploy") is not False or original_recovery.get("releaseDecision") != "NO_GO":
        raise ValueError("Prior source tried to authorize deployment")
    checks = verify_review_requests(trust, identity_registry, reviews, f17_head, source_manifest_sha256, now)
    # The original F14 witnesses are verified with their original F14 SHA
    # and with the original reviewer signatures and actual evidence bytes.
    # Cryptographic validity is never equal to real-world human signoff.
    issues = list(checks["issues"])
    verified_witnesses: list[str] = []
    if f16_witness_records:
        if evidence_root is None:
            issues.append("Original witness evidence directory not provided")
        else:
            try:
                report = human.check_receipts(trust, f16_witness_records, evidence_root,
                                              "6aec03f2add1e613602ee6a3f13aaf0460ffd793", now)
                issues.extend(report["issues"])
                verified_witnesses = [x["requirement"] for x in report["cryptographicClaims"]]
            except (ValueError, OSError, TypeError, KeyError) as error:
                issues.append("Original F14 signed witness review failed: " + str(error))
    # All nine original human acceptance boundaries remain OPEN regardless
    # of technically verified signatures, archived evidence, or CI successes.
    missing = list(keys.ROLE_REQUIREMENTS)
    if original_recovery.get("originalHumanPhysicalAcceptance") is not False:
        issues.append("Physical acceptance may not be self-certified by source report")
    return {"schemaVersion": 1, "f16OriginalSha": F16_SHA, "f17ImplementationSha": f17_head,
            "identityTrust": "EXTERNALLY_PINNED_SIGNATURE_CLAIMS_ONLY",
            "technicallyVerifiedReviewClaims": checks["technicallyVerifiedReviewClaims"],
            "humanRequirementsOpen": missing,
            "technicallyVerifiedWitnessClaims": verified_witnesses,
            "originalRecoveryClaimStatus": "CRYPTOGRAPHIC_CUSTODY_ONLY",
            "originalHumanWitnessCount": 0, "actualPhysicalTestsConfirmed": False,
            "realHumanIdentityAdjudicated": False, "ownerGOAuthorized": False,
            "postreleaseClosureAccepted": False, "releaseDecision": "NO_GO",
            "authorizedToMerge": False, "authorizedToDeploy": False, "issues": issues}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--f17-head", required=True)
    parser.add_argument("--evidence-root", required=True, type=Path)
    parser.add_argument("--trust-bundle", type=Path)
    parser.add_argument("--trust-bundle-sha256")
    parser.add_argument("--trust-root-key")
    parser.add_argument("--trust-predecessor-sha256")
    parser.add_argument("--identity-registry", type=Path)
    parser.add_argument("--identity-registry-sha256")
    parser.add_argument("--identity-predecessor-sha256")
    parser.add_argument("--review-packet", type=Path)
    parser.add_argument("--original-f16-recovery", type=Path)
    parser.add_argument("--original-witness-packet", type=Path)
    parser.add_argument("--manifest-sha256")
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    external = [args.trust_bundle, args.trust_bundle_sha256, args.trust_root_key,
                args.trust_predecessor_sha256, args.identity_registry,
                args.identity_registry_sha256, args.identity_predecessor_sha256,
                args.review_packet, args.original_f16_recovery, args.original_witness_packet,
                args.manifest_sha256]
    if any(value is not None for value in external) and not all(value is not None for value in external):
        raise SystemExit("No partial trust or source evidence: supply all original operator records")
    now = datetime.now(timezone.utc)
    trust: dict[str, dict[str, Any]] = {}
    identities: dict[str, str] = {}
    reviews: list[dict[str, Any]] = []
    witnesses: list[dict[str, Any]] = []
    previous: dict[str, Any] = {}
    if all(value is not None for value in external):
        trust = keys.verify_trust_bundle(args.trust_bundle, args.trust_bundle_sha256,
                                          args.trust_root_key, args.trust_predecessor_sha256, now)
        identities = verify_registry(args.identity_registry, args.identity_registry_sha256,
                                      args.trust_root_key, args.identity_predecessor_sha256,
                                      trust, args.evidence_root, now)
        review_doc = keys.read_json(args.review_packet)
        witness_doc = keys.read_json(args.original_witness_packet)
        if (set(review_doc) != {"schemaVersion", "reviews"} or review_doc["schemaVersion"] != 1 or
                not isinstance(review_doc["reviews"], list) or
                set(witness_doc) != {"schemaVersion", "receipts"} or witness_doc["schemaVersion"] != 1 or
                not isinstance(witness_doc["receipts"], list)):
            raise SystemExit("Untrusted review or witness record schemas")
        reviews = review_doc["reviews"]; witnesses = witness_doc["receipts"]
        previous = keys.read_json(args.original_f16_recovery)
    report = adjudicate(trust, identities, reviews, witnesses, previous, args.f17_head, now,
                        args.manifest_sha256, args.evidence_root)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    return 0 if not report["issues"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
