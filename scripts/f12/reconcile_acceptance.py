#!/usr/bin/env python3
"""F12: deterministic, DENIED-by-default custody and human-acceptance packet."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import stat
from pathlib import Path
from typing import Any

SHA = re.compile(r"^[0-9a-f]{40}$")
DIGEST = re.compile(r"^[0-9a-f]{64}$")
REQUIRED_WORKFLOWS = (
    "PDF Studio CI",
    "F11 cross-browser PDF and independent-reader certification",
    "Consumer performance budget",
    "R10 operational readiness policy",
)
REQUIRED_HUMAN = (
    "f8b-account-sso-authorization",
    "original-origin-schema-and-encrypted-backup-recovery",
    "d-series-image-and-fidelity-acceptance",
    "android-chrome-and-samsung-internet-physical-device",
    "ios-safari-physical-device",
    "nvda-voiceover-and-keyboard-accessibility",
    "independent-adobe-or-third-party-reader-and-print",
    "human-security-privacy-and-release-decision",
    "rollback-and-disaster-recovery-operator-acceptance",
)
FILE_LIMIT = 200 * 1024 * 1024
TOTAL_LIMIT = 512 * 1024 * 1024


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def guarded_artifact(path: Path, root: Path) -> None:
    """Refuse traversal/symlinks and nonregular evidence, including ancestor escapes."""
    if not root.is_dir() or root.is_symlink():
        raise ValueError("Invalid custody root")
    real_root = root.resolve(strict=True)
    relative = path.relative_to(root)
    if not relative.parts or any(p in ("", ".", "..") or "\\" in p for p in relative.parts):
        raise ValueError("Invalid artifact component")
    cursor = root
    for part in relative.parts:
        cursor = cursor / part
        if cursor.is_symlink():
            raise ValueError("Symlinked custody path")
    if not path.resolve(strict=True).is_relative_to(real_root):
        raise ValueError("Outside custody root")
    if not stat.S_ISREG(path.stat().st_mode):
        raise ValueError("Evidence is not a regular file")


def prepare_packet(head: str, runs: list[dict[str, Any]], artifact_dir: Path) -> dict[str, Any]:
    """Caller input supplies claims, never authenticated approvals."""
    if not isinstance(head, str) or not SHA.fullmatch(head):
        raise ValueError("Expected exact 40-character commit SHA")
    if not isinstance(runs, list):
        raise ValueError("Expected run list")
    seen: set[str] = set()
    observations: list[dict[str, Any]] = []
    for run in runs:
        if not isinstance(run, dict):
            raise ValueError("Malformed workflow observation")
        name, number, tested_sha = run.get("name"), run.get("id"), run.get("headSha")
        if not isinstance(name, str) or name in seen or name not in REQUIRED_WORKFLOWS:
            raise ValueError("Unknown or duplicate workflow")
        if type(number) is not int or number <= 0 or not isinstance(tested_sha, str) or not SHA.fullmatch(tested_sha):
            raise ValueError("Malformed workflow identity")
        seen.add(name)
        observations.append({"name": name, "id": number, "headSha": tested_sha,
                             "conclusion": run.get("conclusion")})
    if not artifact_dir.is_dir() or artifact_dir.is_symlink():
        raise ValueError("Custody directory is missing/untrusted")
    receipts = []
    seen_paths: set[str] = set()
    total = 0
    for item in sorted(artifact_dir.rglob("*")):
        if item.is_symlink():
            raise ValueError("Symlinked evidence")
        if item.is_dir():
            continue
        guarded_artifact(item, artifact_dir)
        relative = item.relative_to(artifact_dir).as_posix()
        if relative in seen_paths:
            raise ValueError("Duplicate evidence path")
        seen_paths.add(relative)
        length = item.stat().st_size
        total += length
        if length < 1 or length > FILE_LIMIT or total > TOTAL_LIMIT:
            raise ValueError("Evidence size budget exceeded")
        receipts.append({"path": relative, "bytes": length, "sha256": sha256(item)})
    return {"schemaVersion": 1, "releaseCandidate": head,
            "workflowEvidence": observations, "artifactEvidence": receipts,
            "humanRequirements": [{"id": item, "status": "OPEN", "attestation": None} for item in REQUIRED_HUMAN],
            "releaseDecision": "DENIED", "releaseEnabled": False,
            "note": "Evidence preparation only. No human, device, Account or release approvals collected."}


def validate_packet(packet: dict[str, Any], artifact_dir: Path, expected_sha: str) -> dict[str, Any]:
    """A passing custody check NEVER authorizes release."""
    errors: list[str] = []
    if not isinstance(packet, dict):
        packet = {}
        errors.append("Packet is not an object")
    if not isinstance(expected_sha, str) or not SHA.fullmatch(expected_sha) or packet.get("releaseCandidate") != expected_sha:
        errors.append("Source commit mismatch")
    if packet.get("schemaVersion") != 1:
        errors.append("Unsupported schema version")

    observations = packet.get("workflowEvidence")
    if not isinstance(observations, list):
        observations = []
        errors.append("Malformed workflow evidence")
    names: set[str] = set()
    ids: set[int] = set()
    for run in observations:
        if not isinstance(run, dict):
            errors.append("Malformed workflow row")
            continue
        name, number = run.get("name"), run.get("id")
        if not isinstance(name, str) or name in names or name not in REQUIRED_WORKFLOWS:
            errors.append("Duplicate or unknown workflow")
        else:
            names.add(name)
        if type(number) is not int or number <= 0 or number in ids:
            errors.append("Duplicate or invalid run ID")
        else:
            ids.add(number)
        if run.get("headSha") != expected_sha or run.get("conclusion") != "success":
            errors.append("Unqualified, failed or stale workflow: " + str(name))
    if names != set(REQUIRED_WORKFLOWS):
        errors.append("Mandatory run set incomplete")

    receipts = packet.get("artifactEvidence")
    if not isinstance(receipts, list):
        receipts = []
        errors.append("Malformed artifact receipts")
    seen: set[str] = set()
    total = 0
    for receipt in receipts:
        if not isinstance(receipt, dict):
            errors.append("Malformed artifact receipt")
            continue
        name = receipt.get("path")
        if (not isinstance(name, str) or not name or name in seen or
                Path(name).is_absolute() or "\\" in name or
                any(p in ("", ".", "..") for p in name.split("/"))):
            errors.append("Duplicate/unsafe artifact path")
            continue
        seen.add(name)
        candidate = artifact_dir / name
        try:
            guarded_artifact(candidate, artifact_dir)
            length = candidate.stat().st_size
            total += length
            if (length < 1 or length > FILE_LIMIT or total > TOTAL_LIMIT or
                    type(receipt.get("bytes")) is not int or length != receipt["bytes"] or
                    not isinstance(receipt.get("sha256"), str) or
                    not DIGEST.fullmatch(receipt["sha256"]) or sha256(candidate) != receipt["sha256"]):
                errors.append("Missing or tampered artifact: " + name)
        except (OSError, ValueError):
            errors.append("Missing/untrusted artifact: " + name)
    if not receipts:
        errors.append("Evidence custody is empty")
    if artifact_dir.is_dir() and not artifact_dir.is_symlink():
        try:
            actual: set[str] = set()
            for path in artifact_dir.rglob("*"):
                if path.is_symlink():
                    raise ValueError("Symlink in custody")
                if path.is_file():
                    guarded_artifact(path, artifact_dir)
                    actual.add(path.relative_to(artifact_dir).as_posix())
            if actual != seen:
                errors.append("Added or omitted unreceipted custody file")
        except (OSError, ValueError):
            errors.append("Untrusted custody tree")
    else:
        errors.append("Missing/untrusted custody root")
    human = packet.get("humanRequirements")
    if not isinstance(human, list) or any(not isinstance(x, dict) for x in human):
        human = []
        errors.append("Malformed human requirements")
    if [item.get("id") for item in human] != list(REQUIRED_HUMAN):
        errors.append("Mandatory human evidence requirements altered")
    for item in human:
        if item.get("status") != "OPEN" or item.get("attestation") is not None:
            errors.append("Unverified human acceptance asserted")
    if packet.get("releaseDecision") != "DENIED" or packet.get("releaseEnabled") is not False:
        errors.append("Preparatory packet attempted release authorization")
    return {"schemaVersion": 1, "candidateSha": expected_sha,
            "packetIntegrityPassed": not errors, "releaseDecision": "DENIED",
            "authorizedToDeploy": False, "issues": errors,
            "uncollectedHumanRequirements": list(REQUIRED_HUMAN)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate-sha", required=True)
    parser.add_argument("--runs-json", type=Path, required=True)
    parser.add_argument("--artifact-dir", type=Path, required=True)
    parser.add_argument("--packet", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    packet = prepare_packet(args.candidate_sha, json.loads(args.runs_json.read_text()), args.artifact_dir)
    args.packet.parent.mkdir(parents=True, exist_ok=True)
    args.packet.write_text(json.dumps(packet, indent=2) + "\n")
    report = validate_packet(packet, args.artifact_dir, args.candidate_sha)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    return 0 if report["packetIntegrityPassed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
