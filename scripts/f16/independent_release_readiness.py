#!/usr/bin/env python3
"""F16 independent authority/restore inspection. GO/merge/deploy are impossible.

No production keys or human decisions are generated, stored or assumed.
An external root-pinned signer trust bundle and original physical evidence
must be supplied by separately authorized operators.
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
import operator_release_evidence as f13
sys.path.insert(0, str(ROOT / "scripts" / "f14"))
import witness_intake as f14
sys.path.insert(0, str(ROOT / "scripts" / "f15"))
import reconcile_owner_release as f15

F15_SHA = "6952cb6d0c210c0a910bfc06accefc778f68f44d"
RECOVERY_FIELDS = frozenset({
    "schemaVersion", "kind", "f15SourceSha", "f16SourceSha", "stableSha256",
    "encryptedBackupSha256", "restoreTranscriptSha256", "rollbackTranscriptSha256",
    "issuedAt", "expiresAt", "nonce", "counter", "claim",
})
KINDS = {"restoration", "rollback"}
ENVELOPE = frozenset({"signerId", "payload", "signature"})


def assess_recovery_ceremonies(
    trust: dict[str, dict[str, Any]], ceremonies: list[dict[str, Any]],
    evidence_root: Path, manifest: dict[str, Any], f16_head: str,
    pinned_stable: str, pinned_backup: str, now: datetime
) -> dict[str, Any]:
    """Cryptographic custody only; never infer a performed physical restore."""
    if not isinstance(ceremonies, list) or len(ceremonies) > 2:
        raise ValueError("Unexpected count of restore/rollback ceremonies")
    if not f13.HEX40.fullmatch(f16_head):
        raise ValueError("Exact current F16 head required")
    if (not isinstance(pinned_stable, str) or not f13.HEX64.fullmatch(pinned_stable) or
            not isinstance(pinned_backup, str) or not f13.HEX64.fullmatch(pinned_backup)):
        raise ValueError("External stable and encrypted-backup source SHA256 pins required")
    # A single artifact cannot impersonate multiple independent evidence categories.
    # Prior-stable and restored-stable may have identical bytes, but must be
    # separate original files to demonstrate both source and restored custody.
    if not isinstance(manifest, dict) or set(manifest) != f15.FILES:
        raise ValueError("Complete separately held evidence manifest required")
    paths = [item.get("path") for item in manifest.values() if isinstance(item, dict)]
    if len(paths) != len(f15.FILES) or any(not isinstance(path, str) for path in paths) or len(set(paths)) != len(paths):
        raise ValueError("Different evidence categories must use independently named original files")
    if manifest["restoreTranscript"].get("sha256") == manifest["rollbackTranscript"].get("sha256"):
        raise ValueError("Restore and rollback require distinct original transcript bytes")
    # Actual original file bytes must be present and match original externally pinned hashes.
    source = f15.examine_manifest(evidence_root, manifest, pinned_stable, pinned_backup)
    verified_kinds: set[str] = set()
    used_signers: set[str] = set()
    nonces: set[str] = set()
    errors: list[str] = []
    for entry in ceremonies:
        try:
            if not isinstance(entry, dict) or set(entry) != ENVELOPE:
                raise ValueError("Invalid signed ceremony envelope")
            key_id = entry["signerId"]
            payload = entry["payload"]
            signer = trust.get(key_id)
            if not isinstance(key_id, str) or not isinstance(signer, dict) or signer["revoked"] or signer["role"] != "recovery_operator":
                raise ValueError("Missing, revoked or wrong-role recovery authority")
            if not isinstance(payload, dict) or set(payload) != RECOVERY_FIELDS:
                raise ValueError("Unexpected signed recovery claim shape")
            kind = payload["kind"]
            if kind not in KINDS or kind in verified_kinds or key_id in used_signers:
                raise ValueError("Duplicate recovery event or nonindependent operator")
            if (payload["schemaVersion"] != 1 or payload["f15SourceSha"] != F15_SHA or
                    payload["f16SourceSha"] != f16_head or payload["claim"] != "OBSERVATION_ONLY"):
                raise ValueError("Unbound source SHA or unsafe restoration claim")
            if (payload["stableSha256"] != pinned_stable or
                    payload["encryptedBackupSha256"] != pinned_backup or
                    payload["restoreTranscriptSha256"] != manifest["restoreTranscript"]["sha256"] or
                    payload["rollbackTranscriptSha256"] != manifest["rollbackTranscript"]["sha256"]):
                raise ValueError("Signed ceremony not bound to original bytes or transcripts")
            issued = f13.time_value(payload["issuedAt"])
            expiry = f13.time_value(payload["expiresAt"])
            if issued < signer["grantedAt"] or issued > now + timedelta(minutes=5) or expiry <= now or expiry > issued + timedelta(days=30):
                raise ValueError("Expired, predating or future restoration claim")
            nonce = payload["nonce"]
            count = payload["counter"]
            if (not isinstance(nonce, str) or not re.fullmatch(r"[0-9a-f]{32,128}", nonce) or
                    nonce in nonces or type(count) is not int or count <= 0):
                raise ValueError("Replay nonce or invalid signer counter")
            f13.verify_sig(signer["publicKey"], f13.canonical(payload), entry["signature"])
            verified_kinds.add(kind)
            nonces.add(nonce)
            used_signers.add(key_id)
        except (ValueError, KeyError, TypeError, OSError) as exc:
            errors.append(str(exc))
    return {"signedCeremonies": sorted(verified_kinds),
            "missingCeremonies": sorted(KINDS - verified_kinds),
            "sourceManifestSha256": source["digest"], "sourceObjectCount": source["listedObjects"],
            "originalStableByteEquality": True, "originalBackupExternallyPinned": True,
            "issues": errors, "actualRestoreWitnessAccepted": False,
            "priorStableRecoveryProven": False, "authorizedToRollback": False}


def review(
    trust: dict[str, dict[str, Any]], release_records: dict[str, Any],
    witness_records: list[dict[str, Any]], ceremonies: list[dict[str, Any]],
    evidence_root: Path, f16_head: str, now: datetime,
    pinned_stable: str | None = None, pinned_backup: str | None = None
) -> dict[str, Any]:
    if not isinstance(f16_head, str) or not f13.HEX40.fullmatch(f16_head):
        raise ValueError("Exact F16 HEAD required")
    empty = trust == {} and release_records == {} and witness_records == [] and ceremonies == []
    if empty:
        return {"schemaVersion": 1, "f15OriginalSha": F15_SHA,
                "f16ImplementationSha": f16_head, "operatorTrust": "NOT_CONFIGURED",
                "humanRequirementsOpen": list(f13.ROLE_REQUIREMENTS),
                "signatureClaimsChecked": 0, "independentRecoveryCeremonies": 0,
                "originalRecoveryBytesVerified": False,
                "originalHumanPhysicalAcceptance": False, "ownerReleaseAuthorized": False,
                "separatePostreleaseClosureAccepted": False, "authorizedToMerge": False,
                "authorizedToDeploy": False, "releaseDecision": "NO_GO", "issues": []}
    if not trust or not release_records or not isinstance(witness_records, list) or not isinstance(ceremonies, list):
        raise ValueError("Partial operator evidence/authority is forbidden")
    errors: list[str] = []
    owner: dict[str, Any] = {}
    ceremonies_state: dict[str, Any] = {}
    try:
        # Original F15 review is signed at the immutable qualified F15 source
        # SHA and uses F14's original witnessed-intake SHA. Never relabel these
        # old signatures as current F16 attestations.
        owner = f15.review_packet(trust, release_records, witness_records, evidence_root,
                                  F15_SHA, now, pinned_stable, pinned_backup)
        errors.extend(owner.get("issues", []))
        ceremonies_state = assess_recovery_ceremonies(
            trust, ceremonies, evidence_root, release_records["manifest"],
            f16_head, pinned_stable, pinned_backup, now)
        errors.extend(ceremonies_state.get("issues", []))
        if ceremonies_state.get("missingCeremonies"):
            errors.append("Incomplete independently signed restore and rollback sessions")
    except (ValueError, KeyError, TypeError, OSError) as exc:
        errors.append(str(exc))
    missing = owner.get("humanRequirementsOpen", list(f13.ROLE_REQUIREMENTS))
    # Even if cryptographic claims someday all verify, proof of actual human
    # and physical events requires an independent real-world authority not
    # present here. This verifier is intentionally incapable of GO.
    return {"schemaVersion": 1, "f15OriginalSha": F15_SHA,
            "f16ImplementationSha": f16_head, "operatorTrust": "EXTERNAL_CRYPTOGRAPHIC_CLAIMS_ONLY",
            "humanRequirementsOpen": missing, "signatureClaimsChecked": len(owner.get("operatorReviewStagesCryptographicallyVerified", [])),
            "independentRecoveryCeremonies": len(ceremonies_state.get("signedCeremonies", [])),
            "originalRecoveryBytesVerified": bool(ceremonies_state.get("originalStableByteEquality", False)),
            "originalHumanPhysicalAcceptance": False, "ownerReleaseAuthorized": False,
            "separatePostreleaseClosureAccepted": False, "authorizedToMerge": False,
            "authorizedToDeploy": False, "releaseDecision": "NO_GO", "issues": errors}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--f16-head", required=True)
    parser.add_argument("--evidence-root", type=Path, required=True)
    parser.add_argument("--trust-bundle", type=Path)
    parser.add_argument("--root-public-key")
    parser.add_argument("--trust-sha256")
    parser.add_argument("--previous-sha256")
    parser.add_argument("--release-records", type=Path)
    parser.add_argument("--witness-records", type=Path)
    parser.add_argument("--recovery-records", type=Path)
    parser.add_argument("--pinned-stable-sha256")
    parser.add_argument("--pinned-backup-sha256")
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    external = [args.trust_bundle, args.root_public_key, args.trust_sha256,
                args.previous_sha256, args.release_records, args.witness_records,
                args.recovery_records, args.pinned_stable_sha256, args.pinned_backup_sha256]
    if any(x is not None for x in external) and not all(x is not None for x in external):
        raise SystemExit("No fallback for partially supplied operator keys, pins or evidence")
    key_states: dict[str, dict[str, Any]] = {}
    release: dict[str, Any] = {}
    witnesses: list[dict[str, Any]] = []
    ceremonies: list[dict[str, Any]] = []
    if all(x is not None for x in external):
        key_states = f13.verify_trust_bundle(args.trust_bundle, args.trust_sha256,
                                             args.root_public_key, args.previous_sha256,
                                             datetime.now(timezone.utc))
        release = f13.read_json(args.release_records)
        human_packet = f13.read_json(args.witness_records)
        recovery_packet = f13.read_json(args.recovery_records)
        if (set(human_packet) != {"schemaVersion", "receipts"} or human_packet["schemaVersion"] != 1 or
                not isinstance(human_packet["receipts"], list) or
                set(recovery_packet) != {"schemaVersion", "ceremonies"} or recovery_packet["schemaVersion"] != 1 or
                not isinstance(recovery_packet["ceremonies"], list)):
            raise SystemExit("Operator witness and recovery packet shapes invalid")
        witnesses = human_packet["receipts"]
        ceremonies = recovery_packet["ceremonies"]
    state = review(key_states, release, witnesses, ceremonies, args.evidence_root,
                   args.f16_head, datetime.now(timezone.utc),
                   args.pinned_stable_sha256, args.pinned_backup_sha256)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(state, indent=2) + "\n")
    print(json.dumps(state, indent=2))
    return 0 if not state["issues"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
