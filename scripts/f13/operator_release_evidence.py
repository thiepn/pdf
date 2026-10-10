#!/usr/bin/env python3
"""F13 offline operator evidence verification; NEVER issues or executes release GO."""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
import stat
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

F12_SHA = "8d91bcdb1b385d0ed073d13f1893555f5c4b0f69"
HEX40 = re.compile(r"^[0-9a-f]{40}$")
HEX64 = re.compile(r"^[0-9a-f]{64}$")
ROLE_REQUIREMENTS = {
    "f8b-account-sso-authorization": "account_owner",
    "original-origin-schema-and-encrypted-backup-recovery": "recovery_operator",
    "d-series-image-and-fidelity-acceptance": "visual_owner",
    "android-chrome-and-samsung-internet-physical-device": "mobile_tester",
    "ios-safari-physical-device": "mobile_tester",
    "nvda-voiceover-and-keyboard-accessibility": "accessibility_reviewer",
    "independent-adobe-or-third-party-reader-and-print": "external_reader_reviewer",
    "human-security-privacy-and-release-decision": "security_reviewer",
    "rollback-and-disaster-recovery-operator-acceptance": "recovery_operator",
}
CANONICAL_FIELDS = (
    "schemaVersion", "requirement", "f12SourceSha", "f13SourceSha", "evidencePath",
    "evidenceSha256", "issuedAt", "expiresAt", "nonce", "counter", "decision",
)


def canonical(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON key: " + key)
        result[key] = value
    return result


def read_json(path: Path) -> dict[str, Any]:
    content = path.read_bytes()
    if not content or len(content) > 1024 * 1024:
        raise ValueError("Missing or oversized JSON document")
    value = json.loads(content, object_pairs_hook=no_duplicates)
    if not isinstance(value, dict):
        raise ValueError("JSON document must be an object")
    return value


def time_value(value: Any) -> datetime:
    if not isinstance(value, str) or not value.endswith("Z"):
        raise ValueError("Timestamp must use UTC Z")
    instant = datetime.fromisoformat(value[:-1] + "+00:00")
    if instant.utcoffset() != timedelta(0):
        raise ValueError("UTC timestamp required")
    return instant


def verify_sig(public_key: str, message: bytes, signature: str) -> None:
    if not isinstance(public_key, str) or not isinstance(signature, str):
        raise ValueError("Missing signer public key or signature")
    raw = bytes.fromhex(public_key)
    if len(raw) != 32:
        raise ValueError("Expected 32-byte Ed25519 public key")
    data = base64.b64decode(signature, validate=True)
    if len(data) != 64:
        raise ValueError("Expected Ed25519 signature")
    try:
        Ed25519PublicKey.from_public_bytes(raw).verify(data, message)
    except InvalidSignature as exc:
        raise ValueError("Cryptographic Ed25519 verification failed") from exc


def verify_trust_bundle(path: Path, pinned_sha256: str, pinned_root_key: str,
                        pinned_previous: str, now: datetime) -> dict[str, dict[str, Any]]:
    """Trust requires external digest + external root key; no CI-generated trust keys."""
    if not HEX64.fullmatch(pinned_sha256) or not HEX64.fullmatch(pinned_previous):
        raise ValueError("An externally pinned trust/previous SHA256 is required")
    if hashlib.sha256(path.read_bytes()).hexdigest() != pinned_sha256:
        raise ValueError("Trust bundle does not match independent pinned SHA256")
    bundle = read_json(path)
    if set(bundle) != {"schemaVersion", "sequence", "previousSha256", "operations", "rootSignature"}:
        raise ValueError("Invalid trust bundle schema")
    if bundle["schemaVersion"] != 1 or type(bundle["sequence"]) is not int or bundle["sequence"] < 1:
        raise ValueError("Invalid trust-bundle sequence")
    if bundle["previousSha256"] != pinned_previous:
        raise ValueError("Trust bundle continuity pin mismatch")
    if bundle["sequence"] == 1 and pinned_previous != "0" * 64:
        raise ValueError("Genesis bundle cannot claim non-genesis history")
    if bundle["sequence"] > 1 and pinned_previous == "0" * 64:
        raise ValueError("Rotation bundle requires externally pinned predecessor")
    signed = {k: v for k, v in bundle.items() if k != "rootSignature"}
    verify_sig(pinned_root_key, canonical(signed), bundle["rootSignature"])
    operations = bundle["operations"]
    if not isinstance(operations, list) or not operations:
        raise ValueError("Trust bundle has no history")
    states: dict[str, dict[str, Any]] = {}
    prior_time = datetime.min.replace(tzinfo=timezone.utc)
    for index, event in enumerate(operations, 1):
        if not isinstance(event, dict) or event.get("number") != index:
            raise ValueError("Trust event ordering/replay violation")
        when = time_value(event.get("at"))
        if when < prior_time or when > now + timedelta(minutes=5):
            raise ValueError("Unordered or future trust event")
        prior_time = when
        kind = event.get("kind")
        key_id = event.get("keyId")
        if not isinstance(key_id, str) or not re.fullmatch(r"[a-z0-9][a-z0-9_.-]{2,63}", key_id):
            raise ValueError("Invalid trust key id")
        if kind == "grant":
            if set(event) != {"number", "at", "kind", "keyId", "role", "publicKey"}:
                raise ValueError("Malformed grant")
            role, key = event["role"], event["publicKey"]
            if role not in set(ROLE_REQUIREMENTS.values()) | {"release_operator"} or key_id in states:
                raise ValueError("Duplicate or unapproved operator grant")
            if not isinstance(key, str) or len(bytes.fromhex(key)) != 32:
                raise ValueError("Invalid granted Ed25519 key")
            states[key_id] = {"role": role, "publicKey": key, "grantedAt": when, "revoked": False}
        elif kind == "rotate":
            if set(event) != {"number", "at", "kind", "keyId", "newKeyId", "newPublicKey", "crossSignature"}:
                raise ValueError("Malformed rotation")
            prior = states.get(key_id)
            new_id = event["newKeyId"]
            if prior is None or prior["revoked"] or new_id in states or not isinstance(new_id, str) or not re.fullmatch(r"[a-z0-9][a-z0-9_.-]{2,63}", new_id):
                raise ValueError("Rotation requires active prior signer and new identity")
            new_key = event["newPublicKey"]
            if not isinstance(new_key, str) or len(bytes.fromhex(new_key)) != 32:
                raise ValueError("Invalid rotated key")
            authorizing = {k: v for k, v in event.items() if k != "crossSignature"}
            verify_sig(prior["publicKey"], canonical(authorizing), event["crossSignature"])
            prior["revoked"] = True
            states[new_id] = {"role": prior["role"], "publicKey": new_key, "grantedAt": when, "revoked": False}
        elif kind == "revoke":
            if set(event) != {"number", "at", "kind", "keyId", "reason"}:
                raise ValueError("Malformed revocation")
            previous = states.get(key_id)
            if previous is None or previous["revoked"] or not isinstance(event["reason"], str) or not event["reason"].strip():
                raise ValueError("Invalid or duplicate revocation")
            previous["revoked"] = True
        else:
            raise ValueError("Unrecognized trust operation")
    return states


def verify_evidence_file(root: Path, relative: str, expected_digest: str) -> None:
    if (not isinstance(relative, str) or not relative or "\\" in relative or
            relative.startswith("/") or any(p in ("", ".", "..") for p in relative.split("/")) or
            not isinstance(expected_digest, str) or not HEX64.fullmatch(expected_digest)):
        raise ValueError("Unsafe evidence path/digest")
    if root.is_symlink() or not root.is_dir():
        raise ValueError("Missing or untrusted evidence root")
    cursor = root
    for section in relative.split("/"):
        cursor = cursor / section
        if cursor.is_symlink():
            raise ValueError("Evidence symlink forbidden")
    if not cursor.resolve(strict=True).is_relative_to(root.resolve(strict=True)):
        raise ValueError("Evidence path escapes custody")
    if not stat.S_ISREG(cursor.stat().st_mode) or cursor.stat().st_size > 128 * 1024 * 1024 or cursor.stat().st_size < 1:
        raise ValueError("Invalid evidence bytes")
    digest = hashlib.sha256()
    with cursor.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    if digest.hexdigest() != expected_digest:
        raise ValueError("Evidence bytes changed")


def assess_operator_packets(trust: dict[str, dict[str, Any]], attestations: list[dict[str, Any]],
                            evidence_dir: Path, f13_sha: str, now: datetime) -> dict[str, Any]:
    if not HEX40.fullmatch(f13_sha):
        raise ValueError("Current F13 SHA required")
    observed: dict[str, str] = {}
    counters: dict[str, int] = {}
    nonces: set[str] = set()
    keys_used: set[str] = set()
    errors: list[str] = []
    for envelope in attestations:
        try:
            if not isinstance(envelope, dict) or set(envelope) != {"signerId", "payload", "signature"}:
                raise ValueError("Invalid attestation envelope")
            signer_id, payload = envelope["signerId"], envelope["payload"]
            signer = trust.get(signer_id)
            if signer is None or signer["revoked"]:
                raise ValueError("Missing or revoked signer")
            if not isinstance(payload, dict) or set(payload) != set(CANONICAL_FIELDS):
                raise ValueError("Invalid signed payload schema")
            req = payload["requirement"]
            if req not in ROLE_REQUIREMENTS or signer["role"] != ROLE_REQUIREMENTS[req]:
                raise ValueError("Signer has no independent review authority")
            if req in observed or signer_id in keys_used:
                raise ValueError("Repeated signer or requirement")
            if payload["f12SourceSha"] != F12_SHA or payload["f13SourceSha"] != f13_sha:
                raise ValueError("Stale evidence source head")
            issued = time_value(payload["issuedAt"])
            expires = time_value(payload["expiresAt"])
            if issued < signer["grantedAt"] or issued > now + timedelta(minutes=5) or expires <= now or expires > issued + timedelta(days=90):
                raise ValueError("Expired, predating or future acceptance")
            nonce = payload["nonce"]
            if not isinstance(nonce, str) or not re.fullmatch(r"[0-9a-f]{32,128}", nonce) or nonce in nonces:
                raise ValueError("Replay nonce")
            counter = payload["counter"]
            if type(counter) is not int or counter <= counters.get(signer_id, 0):
                raise ValueError("Replay sequence counter")
            if payload["schemaVersion"] != 1 or payload["decision"] != "ACCEPT":
                raise ValueError("Non-accepting signed record")
            verify_evidence_file(evidence_dir, payload["evidencePath"], payload["evidenceSha256"])
            verify_sig(signer["publicKey"], canonical(payload), envelope["signature"])
            counters[signer_id] = counter
            nonces.add(nonce)
            keys_used.add(signer_id)
            observed[req] = signer_id
        except (ValueError, OSError, TypeError, KeyError) as exc:
            errors.append(str(exc))
    missing = [requirement for requirement in ROLE_REQUIREMENTS if requirement not in observed]
    # A validated cryptographic signature proves authorization and byte ownership,
    # NOT that device/human observations actually happened. Separate witnessed
    # approvals and controlled operator release are always required.
    return {"schemaVersion": 1, "sourceF12": F12_SHA, "sourceF13": f13_sha,
            "cryptographicallyVerifiedRequirements": sorted(observed),
            "uncollectedRequirements": missing, "issues": errors,
            "eligibleForIndependentHumanReview": not errors and not missing,
            "releaseDecision": "NO_GO", "authorizedToMerge": False,
            "authorizedToDeploy": False, "humanPhysicalAcceptance": "OPEN"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--f13-sha", required=True)
    parser.add_argument("--evidence-dir", type=Path, required=True)
    parser.add_argument("--trust-bundle", type=Path)
    parser.add_argument("--pinned-root-key")
    parser.add_argument("--pinned-trust-sha256")
    parser.add_argument("--pinned-previous-sha256")
    parser.add_argument("--attestations", type=Path)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    if not HEX40.fullmatch(args.f13_sha):
        raise SystemExit("Missing exact F13 source commit")
    inputs = (args.trust_bundle, args.pinned_root_key, args.pinned_trust_sha256,
              args.pinned_previous_sha256, args.attestations)
    if any(value is not None for value in inputs) and not all(value is not None for value in inputs):
        raise SystemExit("Incomplete trust arguments are forbidden; no fallback")
    now = datetime.now(timezone.utc)
    trust = {}
    attestations = []
    if all(value is not None for value in inputs):
        trust = verify_trust_bundle(args.trust_bundle, args.pinned_trust_sha256,
                                    args.pinned_root_key, args.pinned_previous_sha256, now)
        raw = read_json(args.attestations)
        if set(raw) != {"schemaVersion", "attestations"} or raw["schemaVersion"] != 1 or not isinstance(raw["attestations"], list):
            raise SystemExit("Malformed operator witness packet")
        attestations = raw["attestations"]
    report = assess_operator_packets(trust, attestations, args.evidence_dir, args.f13_sha, now)
    if not all(value is not None for value in inputs):
        report["operatorTrust"] = "NOT_CONFIGURED"
        report["note"] = "No root key or actual witness approvals supplied; DENIED by default."
    else:
        report["operatorTrust"] = "EXTERNALLY_PINNED_SIGNATURE_VERIFIED"
        report["note"] = "Signatures do not substitute for real-world witnesses or release authorization."
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if not report["issues"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
