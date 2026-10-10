#!/usr/bin/env python3
"""F14 offline independently witnessed intake; cannot grant merge/deploy access.

Signatures authenticate evidence claims and roles. They cannot prove that real
devices, people or a recovery ceremony existed. Only external human governance
can adjudicate a later release, and this tool always produces NO_GO.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "f13"))
import operator_release_evidence as f13

F13_SHA = "6953bb082044bc96d88b530e1db0ff743b9b6d88"
REQUIREMENTS = dict(f13.ROLE_REQUIREMENTS)
PHYSICAL_METHODS = {
    "f8b-account-sso-authorization": "owner-authenticated-account-review",
    "original-origin-schema-and-encrypted-backup-recovery": "witnessed-original-restore",
    "d-series-image-and-fidelity-acceptance": "human-visual-reference-review",
    "android-chrome-and-samsung-internet-physical-device": "physical-android-browser",
    "ios-safari-physical-device": "physical-ios-safari",
    "nvda-voiceover-and-keyboard-accessibility": "human-assistive-technology",
    "independent-adobe-or-third-party-reader-and-print": "external-reader-and-physical-printer",
    "human-security-privacy-and-release-decision": "owner-security-release-review",
    "rollback-and-disaster-recovery-operator-acceptance": "witnessed-restore-and-rollback",
}
OBSERVATION_FIELDS = frozenset({
    "schemaVersion", "requirement", "f13SourceSha", "f14SourceSha",
    "reviewerReceiptSha256", "evidenceSha256", "method", "sessionId",
    "witnessedAt", "nonce", "counter", "claim",
})
ENVELOPE_FIELDS = frozenset({"signerId", "payload", "signature"})


def check_receipts(trust: dict[str, dict[str, Any]],
                   records: list[dict[str, Any]], evidence_dir: Path,
                   current_head: str, now: datetime) -> dict[str, Any]:
    if not isinstance(current_head, str) or not f13.HEX40.fullmatch(current_head):
        raise ValueError("Exact F14 implementation head is required")
    if not isinstance(records, list) or len(records) > len(REQUIREMENTS):
        raise ValueError("Receipt list invalid or above nine requirements")
    issues: list[str] = []
    verified: list[dict[str, str]] = []
    reviewer_keys: set[str] = set()
    witnesses: set[str] = set()
    all_nonces: set[str] = set()
    sessions: set[str] = set()
    counters: dict[str, int] = {}
    obligations: set[str] = set()
    for index, record in enumerate(records, 1):
        try:
            if not isinstance(record, dict) or set(record) != {"schemaVersion", "reviewer", "witness"} or record["schemaVersion"] != 1:
                raise ValueError("Invalid witness record schema")
            reviewer, witness = record["reviewer"], record["witness"]
            if not isinstance(reviewer, dict) or set(reviewer) != ENVELOPE_FIELDS:
                raise ValueError("Missing independently signed reviewer receipt")
            if not isinstance(witness, dict) or set(witness) != ENVELOPE_FIELDS:
                raise ValueError("Missing separately signed independent witness")
            review_key_id, witness_id = reviewer["signerId"], witness["signerId"]
            if (not isinstance(review_key_id, str) or not isinstance(witness_id, str) or
                    review_key_id == witness_id or review_key_id in reviewer_keys or
                    witness_id in witnesses or review_key_id in witnesses or witness_id in reviewer_keys):
                raise ValueError("Review and witness identity segregation/reuse violation")
            review_signer, witness_signer = trust.get(review_key_id), trust.get(witness_id)
            if (not isinstance(review_signer, dict) or review_signer["revoked"] or
                    not isinstance(witness_signer, dict) or witness_signer["revoked"] or
                    witness_signer["role"] != "release_operator"):
                raise ValueError("Signer absent/revoked or no independently authorized witness")
            payload, observation = reviewer["payload"], witness["payload"]
            if (not isinstance(payload, dict) or set(payload) != set(f13.CANONICAL_FIELDS) or
                    not isinstance(observation, dict) or set(observation) != OBSERVATION_FIELDS):
                raise ValueError("Unexpected signed payload keys")
            requirement = payload["requirement"]
            if (requirement not in REQUIREMENTS or requirement in obligations or
                    observation["requirement"] != requirement or
                    review_signer["role"] != REQUIREMENTS[requirement]):
                raise ValueError("Duplicate or incorrectly authorized human requirement")
            if (payload["f12SourceSha"] != f13.F12_SHA or
                    payload["f13SourceSha"] != F13_SHA or
                    observation["f13SourceSha"] != F13_SHA or
                    observation["f14SourceSha"] != current_head):
                raise ValueError("Stale/unbound source SHA")
            # In F14, the F13 reviewer record's f13SourceSha must remain the
            # ORIGINAL F13 source HEAD, not the distinct F14 implementation.
            if payload.get("decision") != "ACCEPT" or payload.get("schemaVersion") != 1:
                raise ValueError("Review receipt did not approve its stated test")
            issued = f13.time_value(payload["issuedAt"])
            expires = f13.time_value(payload["expiresAt"])
            witnessed = f13.time_value(observation["witnessedAt"])
            if (issued < review_signer["grantedAt"] or witnessed < witness_signer["grantedAt"] or
                    witnessed < issued or witnessed > now + timedelta(minutes=5) or
                    issued > now + timedelta(minutes=5) or expires <= now or
                    expires > issued + timedelta(days=90)):
                raise ValueError("Invalid chronology, future claim or expired signoff")
            if (observation["method"] != PHYSICAL_METHODS[requirement] or
                    observation["schemaVersion"] != 1 or observation["claim"] != "OBSERVED"):
                raise ValueError("No matching independently witnessed activity")
            if (not isinstance(observation["sessionId"], str) or
                    not re.fullmatch(r"[a-zA-Z0-9_-]{16,96}", observation["sessionId"]) or
                    observation["sessionId"] in sessions):
                raise ValueError("Missing, duplicate or invalid unique witness session")
            for nonce in (payload["nonce"], observation["nonce"]):
                if not isinstance(nonce, str) or not re.fullmatch(r"[0-9a-f]{32,128}", nonce) or nonce in all_nonces:
                    raise ValueError("Missing, duplicate or replayed nonce")
            for signer_id, counter in ((review_key_id, payload["counter"]), (witness_id, observation["counter"])):
                if type(counter) is not int or counter <= counters.get(signer_id, 0):
                    raise ValueError("Replay or non-monotonic signer counter")
            if observation["reviewerReceiptSha256"] != hashlib.sha256(f13.canonical(reviewer)).hexdigest():
                raise ValueError("Witness was not cryptographically bound to the reviewer receipt")
            if observation["evidenceSha256"] != payload["evidenceSha256"]:
                raise ValueError("Witness and reviewer refer to different physical evidence")
            f13.verify_evidence_file(evidence_dir, payload["evidencePath"], payload["evidenceSha256"])
            f13.verify_sig(review_signer["publicKey"], f13.canonical(payload), reviewer["signature"])
            f13.verify_sig(witness_signer["publicKey"], f13.canonical(observation), witness["signature"])
            obligations.add(requirement)
            reviewer_keys.add(review_key_id)
            witnesses.add(witness_id)
            sessions.add(observation["sessionId"])
            all_nonces.add(payload["nonce"])
            all_nonces.add(observation["nonce"])
            counters[review_key_id] = payload["counter"]
            counters[witness_id] = observation["counter"]
            verified.append({"requirement": requirement, "reviewerKeyId": review_key_id,
                             "independentWitnessKeyId": witness_id,
                             "reviewerEvidenceSha256": payload["evidenceSha256"],
                             "witnessSession": observation["sessionId"],
                             "status": "CRYPTOGRAPHICALLY_VALID_CLAIM_ONLY"})
        except (ValueError, KeyError, TypeError, OSError, OverflowError) as error:
            issues.append(f"record {index}: {error}")
    missing = [key for key in REQUIREMENTS if key not in obligations]
    return {"schemaVersion": 1, "f13SourceSha": F13_SHA, "f14ImplementationSha": current_head,
            "cryptographicClaims": verified, "missingHumanRequirements": missing,
            "issues": issues, "canSubmitForIndependentHumanReview": not issues and not missing,
            "actualWitnessedPhysicalApprovalsConfirmed": False,
            "trustedHumanApprovalCount": 0,
            "releaseDecision": "NO_GO", "authorizedToMerge": False, "authorizedToDeploy": False,
            "safety": "Signatures alone never prove human/physical occurrence or authorize release"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--current-head", required=True)
    parser.add_argument("--evidence-dir", type=Path, required=True)
    parser.add_argument("--trust-bundle", type=Path)
    parser.add_argument("--pinned-root-key")
    parser.add_argument("--pinned-trust-sha256")
    parser.add_argument("--pinned-previous-sha256")
    parser.add_argument("--receipts", type=Path)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    if not isinstance(args.current_head, str) or not f13.HEX40.fullmatch(args.current_head):
        raise SystemExit("Expected real F14 implementation commit SHA")
    inputs = (args.trust_bundle, args.pinned_root_key, args.pinned_trust_sha256,
              args.pinned_previous_sha256, args.receipts)
    if any(value is not None for value in inputs) and not all(value is not None for value in inputs):
        raise SystemExit("Partial trust/receipt intake is invalid")
    now = datetime.now(timezone.utc)
    trust: dict[str, dict[str, Any]] = {}
    entries: list[dict[str, Any]] = []
    if all(value is not None for value in inputs):
        trust = f13.verify_trust_bundle(args.trust_bundle, args.pinned_trust_sha256,
                                        args.pinned_root_key, args.pinned_previous_sha256, now)
        raw = f13.read_json(args.receipts)
        if set(raw) != {"schemaVersion", "receipts"} or raw["schemaVersion"] != 1 or not isinstance(raw["receipts"], list):
            raise SystemExit("Malformed operator receipts document")
        entries = raw["receipts"]
    packet = check_receipts(trust, entries, args.evidence_dir, args.current_head, now)
    packet["trustStatus"] = ("EXTERNALLY_PINNED_ED25519_CLAIMS_ONLY"
                             if all(value is not None for value in inputs) else "NOT_CONFIGURED")
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(packet, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(packet, indent=2))
    # Do not treat missing human evidence as a failing tool run: it MUST yield NO_GO.
    return 0 if not packet["issues"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
