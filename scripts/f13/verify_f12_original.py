#!/usr/bin/env python3
"""F13: independently revalidate original F12 NO_GO packet and its parent F11 custody."""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import re
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "f12"))
import reconcile_acceptance as acceptance
import verify_github_evidence as github

F12_SHA = "8d91bcdb1b385d0ed073d13f1893555f5c4b0f69"
F11_SHA = "ab21d2d6e09033737d76867606454ba8f672c79f"
F12_RUN = 38039819313
F12_ARTIFACT = 11664918720
F12_WORKFLOW = "F12 read-only original evidence custody and denied release"
F12_NAME = "f12-source-bound-denied-human-acceptance"
HEX64 = re.compile(r"^sha256:([0-9a-f]{64})$")


def check_original_archive(original: bytes, custody_root: Path) -> dict:
    """No arbitrary ZIP extraction; only approved named custody members are materialized."""
    if not original or len(original) > 80 * 1024 * 1024:
        raise ValueError("Original F12 archive absent or oversized")
    if custody_root.exists() and (custody_root.is_symlink() or any(custody_root.iterdir())):
        raise ValueError("Source custody root must be empty and nonsymlinked")
    custody_root.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(original)) as source:
        items = source.infolist()
        if len(items) != 9 or any(item.is_dir() for item in items):
            raise ValueError("F12 source archive must contain 9 exact files")
        expected = {
            "f12-original-evidence/github-original-artifacts.json",
            "f12-original-evidence/runs.json",
            "f12-acceptance/denied-report.json",
            "f12-acceptance/packet.json",
        } | {
            f"f12-original-evidence/custody/{run}-{artifact}-{name}.zip"
            for run, artifact, name in (
                (38035348922, 11663386782, "f11-crossbrowser-actual-export-evidence"),
                (38035348951, 11664365464, "phase30-source-audit"),
                (38035348951, 11664005480, "phase11-corpus-evidence"),
                (38035348951, 11664570240, "phase30-verified-dist"),
                (38035348951, 11664586829, "phase30-playwright-report"),
            )
        }
        if {item.filename for item in items} != expected or len({item.filename for item in items}) != len(items):
            raise ValueError("F12 original ZIP contains missing, duplicate or unexpected paths")
        for item in items:
            kind = (item.external_attr >> 16) & 0o170000
            if item.file_size < 1 or item.file_size > 80 * 1024 * 1024 or kind == 0o120000:
                raise ValueError("Unsafe original F12 ZIP member")
        packet = json.loads(source.read("f12-acceptance/packet.json"),
                            object_pairs_hook=acceptance.no_duplicates if hasattr(acceptance, "no_duplicates") else None)
        denial = json.loads(source.read("f12-acceptance/denied-report.json"))
        provenances = json.loads(source.read("f12-original-evidence/github-original-artifacts.json"))
        runs = json.loads(source.read("f12-original-evidence/runs.json"))
        if not isinstance(provenances, dict) or provenances.get("sourceSha") != F11_SHA or provenances.get("implementationSha") != F12_SHA:
            raise ValueError("F12 original source and implementation heads were replaced")
        if (not isinstance(denial, dict) or denial.get("packetIntegrityPassed") is not True
                or denial.get("issues") != [] or denial.get("authorizedToDeploy") is not False
                or denial.get("releaseDecision") != "DENIED"):
            raise ValueError("Original F12 evidence denied report altered")
        if not isinstance(runs, list) or len(runs) != 4:
            raise ValueError("Original four F11 workflow observations missing")
        if packet.get("workflowEvidence") != runs:
            raise ValueError("Original run observations differ from sealed F12 packet")
        artifacts = provenances.get("artifactEvidence")
        if not isinstance(artifacts, list) or len(artifacts) != 5:
            raise ValueError("F12 did not bind five original F11 archives")
        for record in artifacts:
            if not isinstance(record, dict):
                raise ValueError("Untrusted original artifact record")
            name = f"{record.get('runId')}-{record.get('artifactId')}-{record.get('name')}.zip"
            member = "f12-original-evidence/custody/" + name
            if member not in expected:
                raise ValueError("Original custody member not in qualified source set")
            bytes_ = source.read(member)
            if hashlib.sha256(bytes_).hexdigest() != record.get("zipSha256") or len(bytes_) != record.get("bytes"):
                raise ValueError("Nested original GitHub evidence archive was changed")
            (custody_root / name).write_bytes(bytes_)
        checked = acceptance.validate_packet(packet, custody_root, F11_SHA)
        if not checked["packetIntegrityPassed"] or checked["authorizedToDeploy"] is not False:
            raise ValueError("F12 original custody no longer qualifies")
        if len(checked["uncollectedHumanRequirements"]) != 9 or len(packet["humanRequirements"]) != 9:
            raise ValueError("Missing original human acceptance blockers")
        if any(item.get("status") != "OPEN" or item.get("attestation") is not None for item in packet["humanRequirements"]):
            raise ValueError("Original F12 packet forged human approval")
        if packet.get("releaseEnabled") is not False:
            raise ValueError("Original F12 packet armed deployment")
        return {"schemaVersion": 1, "F11SourceSha": F11_SHA, "F12SourceSha": F12_SHA,
                "originalRunCount": 4, "originalArtifactCount": len(artifacts),
                "verifiedSourceCustody": True, "f12Integrity": True,
                "humanRequirementsOpen": 9, "releaseDecision": "NO_GO",
                "authorizedToDeploy": False}


def authenticate_source(token: str, current_head: str, output: Path) -> dict:
    if not token or not re.fullmatch(r"[0-9a-f]{40}", current_head):
        raise ValueError("Source authentication requires read-only token and exact current commit")
    run = github.api_json(f"/repos/thiepn/pdf/actions/runs/{F12_RUN}", token)
    if (run.get("id") != F12_RUN or run.get("head_sha") != F12_SHA or
            run.get("name") != F12_WORKFLOW or run.get("status") != "completed" or
            run.get("conclusion") != "success"):
        raise ValueError("The original F12 CI run is missing or not qualified")
    listed = github.api_json(f"/repos/thiepn/pdf/actions/runs/{F12_RUN}/artifacts?per_page=100", token)
    matches = [a for a in listed.get("artifacts", []) if a.get("name") == F12_NAME]
    if len(matches) != 1 or matches[0].get("id") != F12_ARTIFACT or matches[0].get("expired") is not False:
        raise ValueError("Original F12 artifact identity unavailable, expired or duplicated")
    record = matches[0]
    expected = record.get("digest")
    if not isinstance(expected, str) or not HEX64.fullmatch(expected):
        raise ValueError("GitHub original archive SHA256 unavailable")
    raw = github.get_archive(F12_ARTIFACT, token)
    actual = hashlib.sha256(raw).hexdigest()
    if actual != expected.removeprefix("sha256:"):
        raise ValueError("Original GitHub archive bytes differ from its signed service digest")
    with TemporaryDirectory(prefix="f13-source-custody-") as temp:
        audited = check_original_archive(raw, Path(temp) / "custody")
    audited.update({"F13ImplementationSha": current_head, "originalF12Workflow": F12_RUN,
                    "originalF12ArtifactId": F12_ARTIFACT, "originalF12ZipSha256": actual,
                    "origin": "GitHub read-only API + original ZIP bytes; not human approval"})
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(audited, indent=2) + "\n")
    return audited


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--current-head", required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    state = authenticate_source(os.environ.get("F13_GITHUB_TOKEN", ""), args.current_head, args.report)
    print(json.dumps(state, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
