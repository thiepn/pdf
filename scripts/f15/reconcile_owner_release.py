#!/usr/bin/env python3
"""F15 independent evidence reconciliation, owner-vs-postrelease custody; NEVER a release executor."""
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
import operator_release_evidence as trust_code
sys.path.insert(0, str(ROOT / "scripts" / "f14"))
import witness_intake as witness_code

F14_SHA = "6aec03f2add1e613602ee6a3f13aaf0460ffd793"
STAGES = {
    "ownerReleaseReview": {"role": "account_owner", "claim": "REVIEW_REQUESTED"},
    "independentOperatorReview": {"role": "release_operator", "claim": "EVIDENCE_RECEIVED"},
    "postreleaseClosureReview": {"role": "recovery_operator", "claim": "CLOSURE_REVIEW_ONLY"},
}
FILES = {
    "priorStable", "restoredStable", "encryptedBackup", "restoreTranscript",
    "rollbackTranscript", "accessibilityWitness", "mobileWitness",
    "thirdPartyReaderWitness", "privacyAndRightsProvenance",
}
CLAIM_FIELDS = {
    "schemaVersion", "stage", "claim", "f14SourceSha", "f15SourceSha",
    "evidenceManifestSha256", "issuedAt", "expiresAt", "nonce", "counter",
}
DECISION = "NO_GO"


def signed_claim(claim: dict[str, Any], signer: dict[str, Any],
                 signature: str, role: str, f15_sha: str, now: datetime) -> None:
    if not isinstance(claim, dict) or set(claim) != CLAIM_FIELDS:
        raise ValueError("Signed claim fields missing/extra")
    stage = claim["stage"]
    if stage not in STAGES or STAGES[stage]["role"] != role or claim["claim"] != STAGES[stage]["claim"]:
        raise ValueError("Wrong role, stage or semantic claim")
    if claim["schemaVersion"] != 1 or claim["f14SourceSha"] != F14_SHA or claim["f15SourceSha"] != f15_sha:
        raise ValueError("Attestation bound to stale F14/F15 source head")
    if not isinstance(claim["evidenceManifestSha256"], str) or not trust_code.HEX64.fullmatch(claim["evidenceManifestSha256"]):
        raise ValueError("Missing evidence manifest SHA256")
    issued = trust_code.time_value(claim["issuedAt"])
    expires = trust_code.time_value(claim["expiresAt"])
    if (issued < signer["grantedAt"] or issued > now + timedelta(minutes=5)
            or expires <= now or expires > issued + timedelta(days=30)):
        raise ValueError("Untrusted claim chronology")
    if not isinstance(claim["nonce"], str) or not re.fullmatch(r"[0-9a-f]{32,128}", claim["nonce"]):
        raise ValueError("Missing/unsafe anti-replay nonce")
    if type(claim["counter"]) is not int or claim["counter"] < 1:
        raise ValueError("Invalid monotonic sequence counter")
    trust_code.verify_sig(signer["publicKey"], trust_code.canonical(claim), signature)


def examine_manifest(evidence_dir: Path, manifest: dict[str, Any],
                     externally_pinned_stable_sha256: str | None,
                     externally_pinned_backup_sha256: str | None) -> dict[str, Any]:
    if (not isinstance(externally_pinned_stable_sha256, str) or
            not trust_code.HEX64.fullmatch(externally_pinned_stable_sha256) or
            not isinstance(externally_pinned_backup_sha256, str) or
            not trust_code.HEX64.fullmatch(externally_pinned_backup_sha256)):
        raise ValueError("Independently pinned prior-stable and encrypted backup SHA256 are mandatory")
    if not isinstance(manifest, dict) or set(manifest) != FILES:
        raise ValueError("Missing mandatory prior-stable, backup, privacy or device/reader evidence objects")
    hashes = {}
    for name, record in manifest.items():
        if not isinstance(record, dict) or set(record) != {"path", "sha256"}:
            raise ValueError("Unbound or malformed evidence object " + name)
        trust_code.verify_evidence_file(evidence_dir, record["path"], record["sha256"])
        hashes[name] = record["sha256"]
    if hashes["priorStable"] != externally_pinned_stable_sha256:
        raise ValueError("Prior-stable bytes differ from independent external digest pin")
    if hashes["encryptedBackup"] != externally_pinned_backup_sha256:
        raise ValueError("Encrypted backup bytes differ from independent external digest pin")
    if hashes["priorStable"] != hashes["restoredStable"]:
        raise ValueError("Prior-stable and restored-object bytes differ")
    if hashes["encryptedBackup"] == hashes["restoredStable"]:
        raise ValueError("Backup ciphertext improperly substituted for verified stable bytes")
    # Hash equivalence does NOT prove genuine original-origin restore or real prior-stable execution.
    return {"digest": hashlib.sha256(trust_code.canonical(manifest)).hexdigest(),
            "listedObjects": len(FILES),
            "byteComparison": "PRIOR_STABLE_AND_RESTORED_IDENTICAL",
            "actualRestoreWitnessConfirmed": False}


def review_packet(trust: dict[str, dict[str, Any]], envelope: dict[str, Any],
                  witness_records: list[dict[str, Any]], evidence_dir: Path,
                  f15_sha: str, now: datetime,
                  pinned_stable_sha256: str | None = None,
                  pinned_backup_sha256: str | None = None) -> dict[str, Any]:
    """Inspect evidence without granting GO, merger, deploy or postrelease closure."""
    if not isinstance(f15_sha, str) or not trust_code.HEX40.fullmatch(f15_sha):
        raise ValueError("Exact current head required")
    if trust == {} and envelope == {} and witness_records == []:
        return {"schemaVersion": 1, "f14SourceSha": F14_SHA,
                "f15ImplementationSha": f15_sha, "releaseDecision": DECISION,
                "authorizedToMerge": False, "authorizedToDeploy": False,
                "postreleaseClosureAccepted": False,
                "genuinePhysicalAcceptanceRecorded": False,
                "operatorReviewStagesCryptographicallyVerified": [],
                "evidenceObjectsStructurallyVerified": [],
                "evidenceManifestSha256": None,
                "humanRequirementsOpen": list(trust_code.ROLE_REQUIREMENTS),
                "issues": [], "independentOperatorReviewEligible": False,
                "note": "No real operator trust, witnessed evidence or human decisions supplied; NO_GO."}
    issues: list[str] = []
    examined = []
    verified_roles: list[str] = []
    manifest_sha = None
    original_human = {"missingHumanRequirements": list(trust_code.ROLE_REQUIREMENTS),
                      "issues": [], "cryptographicClaims": [],
                      "actualWitnessedPhysicalApprovalsConfirmed": False}
    try:
        if not isinstance(envelope, dict) or set(envelope) != {"schemaVersion", "manifest", "decisions"}:
            raise ValueError("Malformed release review envelope")
        if envelope["schemaVersion"] != 1:
            raise ValueError("Unsupported packet schema")
        manifest_info = examine_manifest(evidence_dir, envelope["manifest"],
                                         pinned_stable_sha256, pinned_backup_sha256)
        manifest_sha = manifest_info["digest"]
        examined = sorted(FILES)
        signed = envelope["decisions"]
        if not isinstance(signed, dict) or set(signed) != set(STAGES):
            raise ValueError("Missing independent pre-release vs postrelease review stages")
        identity: set[str] = set()
        nonces: set[str] = set()
        sequence: dict[str, int] = {}
        moments: dict[str, datetime] = {}
        for stage in STAGES:
            record = signed[stage]
            if not isinstance(record, dict) or set(record) != {"signerId", "claim", "signature"}:
                raise ValueError("Malformed operator envelope " + stage)
            signer_id = record["signerId"]
            if not isinstance(signer_id, str) or signer_id in identity:
                raise ValueError("Owner, operator and closure signers must be distinct")
            signer = trust.get(signer_id)
            if signer is None or signer["revoked"] or signer["role"] != STAGES[stage]["role"]:
                raise ValueError("Missing, revoked or unauthorized signer: " + stage)
            claim = record["claim"]
            if not isinstance(claim, dict) or claim.get("stage") != stage:
                raise ValueError("Stage substitution")
            if claim.get("evidenceManifestSha256") != manifest_sha:
                raise ValueError("Operator did not countersign exact evidence set")
            signed_claim(claim, signer, record["signature"], STAGES[stage]["role"], f15_sha, now)
            if claim["nonce"] in nonces or claim["counter"] <= sequence.get(signer_id, 0):
                raise ValueError("Replay nonce or operator counter")
            identity.add(signer_id)
            nonces.add(claim["nonce"])
            sequence[signer_id] = claim["counter"]
            moments[stage] = trust_code.time_value(claim["issuedAt"])
            verified_roles.append(stage)
        if moments["postreleaseClosureReview"] <= moments["independentOperatorReview"]:
            raise ValueError("Postrelease closure cannot precede pre-release operator review")
    except (ValueError, OSError, KeyError, TypeError, OverflowError) as exc:
        issues.append(str(exc))
    try:
        original_human = witness_code.check_receipts(trust, witness_records, evidence_dir, F14_SHA, now)
        if original_human["issues"]:
            issues.extend(original_human["issues"])
    except (ValueError, OSError, KeyError, TypeError) as exc:
        issues.append("Human evidence input invalid: " + str(exc))
    outstanding = original_human["missingHumanRequirements"]
    # Important: even fully verified cryptographic records only prove message origin
    # and file custody. Neither this verifier nor CI can attest real humans or hardware.
    return {"schemaVersion": 1, "f14SourceSha": F14_SHA, "f15ImplementationSha": f15_sha,
            "releaseDecision": DECISION, "authorizedToMerge": False,
            "authorizedToDeploy": False, "postreleaseClosureAccepted": False,
            "genuinePhysicalAcceptanceRecorded": False,
            "operatorReviewStagesCryptographicallyVerified": verified_roles,
            "evidenceObjectsStructurallyVerified": examined,
            "evidenceManifestSha256": manifest_sha,
            "humanRequirementsOpen": outstanding, "issues": issues,
            "independentOperatorReviewEligible": not issues and not outstanding,
            "note": "Evidence and signatures cannot authorize GO or claim human/physical tests"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--f15-head", required=True)
    parser.add_argument("--evidence-root", type=Path, required=True)
    parser.add_argument("--trust-bundle", type=Path)
    parser.add_argument("--trust-sha256")
    parser.add_argument("--root-public-key")
    parser.add_argument("--previous-sha256")
    parser.add_argument("--pinned-prior-stable-sha256")
    parser.add_argument("--pinned-encrypted-backup-sha256")
    parser.add_argument("--release-records", type=Path)
    parser.add_argument("--witness-records", type=Path)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    all_inputs = (args.trust_bundle, args.trust_sha256, args.root_public_key,
                  args.previous_sha256, args.release_records, args.witness_records,
                  args.pinned_prior_stable_sha256, args.pinned_encrypted_backup_sha256)
    if any(x is not None for x in all_inputs) and not all(x is not None for x in all_inputs):
        raise SystemExit("Partial external operator trust or records are invalid")
    trust: dict[str, dict[str, Any]] = {}
    release_packet: dict[str, Any] = {}
    witness_records: list[dict[str, Any]] = []
    if all(x is not None for x in all_inputs):
        trust = trust_code.verify_trust_bundle(
            args.trust_bundle, args.trust_sha256, args.root_public_key,
            args.previous_sha256, datetime.now(timezone.utc))
        release_packet = trust_code.read_json(args.release_records)
        witness_source = trust_code.read_json(args.witness_records)
        if set(witness_source) != {"schemaVersion", "receipts"} or witness_source["schemaVersion"] != 1 or not isinstance(witness_source["receipts"], list):
            raise SystemExit("Invalid independent witnessed human packet")
        witness_records = witness_source["receipts"]
    report = review_packet(trust, release_packet, witness_records, args.evidence_root,
                           args.f15_head, datetime.now(timezone.utc),
                           args.pinned_prior_stable_sha256,
                           args.pinned_encrypted_backup_sha256)
    report["operatorTrustStatus"] = ("EXTERNALLY_PINNED_EVIDENCE_CLAIMS_ONLY"
                                      if all(x is not None for x in all_inputs) else "NOT_CONFIGURED")
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    # Missing human requirements produce a valid NO_GO result, never a false certification.
    return 0 if not report["issues"] or report["operatorTrustStatus"] == "NOT_CONFIGURED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
