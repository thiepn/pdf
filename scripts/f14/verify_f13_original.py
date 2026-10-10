#!/usr/bin/env python3
"""F14 read-only independent authentication of F13's actual NO_GO evidence.

Never treats GitHub checks or synthetic samples as human approvals.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import sys
from tempfile import TemporaryDirectory
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "f12"))
import verify_github_evidence as github
sys.path.insert(0, str(ROOT / "scripts" / "f13"))
import verify_f12_original as f13_source
import operator_release_evidence as operator

F13_SHA = "6953bb082044bc96d88b530e1db0ff743b9b6d88"
F13_RUN = 38057626514
F13_ARTIFACT = 11672078495
F13_WORKFLOW = "F13 independent operator custody and default NO-GO"
F13_ARTIFACT_NAME = "f13-original-source-and-independent-operator-no-go"
MEMBERS = {
    "f13-original-source/f12-custody.json",
    "f13-operator-decision/no-go.json",
}
HEX40 = re.compile(r"^[0-9a-f]{40}$")
HEX64 = re.compile(r"^sha256:([0-9a-f]{64})$")


def load_original_zip(raw: bytes) -> dict:
    if not isinstance(raw, bytes) or not 128 <= len(raw) <= 4 * 1024 * 1024:
        raise ValueError("Original F13 archive missing or oversized")
    with zipfile.ZipFile(io.BytesIO(raw)) as bundle:
        entries = bundle.infolist()
        if len(entries) != 2 or len({entry.filename for entry in entries}) != 2:
            raise ValueError("Original F13 archive has unexpected/duplicate members")
        if {entry.filename for entry in entries} != MEMBERS:
            raise ValueError("Original F13 archive member contract changed")
        for entry in entries:
            kind = (entry.external_attr >> 16) & 0o170000
            if entry.is_dir() or kind == 0o120000 or not 1 <= entry.file_size <= 256 * 1024:
                raise ValueError("Invalid ZIP member type or size")
        source = json.loads(bundle.read("f13-original-source/f12-custody.json"),
                            object_pairs_hook=operator.no_duplicates)
        decision = json.loads(bundle.read("f13-operator-decision/no-go.json"),
                              object_pairs_hook=operator.no_duplicates)
    if not isinstance(source, dict) or source.get("F13ImplementationSha") != F13_SHA:
        raise ValueError("F13 original source head missing")
    if (source.get("F12SourceSha") != operator.F12_SHA or
            source.get("F11SourceSha") != f13_source.F11_SHA or
            source.get("originalF12Workflow") != f13_source.F12_RUN or
            source.get("originalF12ArtifactId") != f13_source.F12_ARTIFACT or
            source.get("verifiedSourceCustody") is not True or
            source.get("f12Integrity") is not True or
            source.get("originalRunCount") != 4 or source.get("originalArtifactCount") != 5 or
            source.get("humanRequirementsOpen") != 9 or source.get("releaseDecision") != "NO_GO" or
            source.get("authorizedToDeploy") is not False):
        raise ValueError("F13 recorded invalid F12/F11 source chain or approval")
    parent_digest = source.get("originalF12ZipSha256")
    if not isinstance(parent_digest, str) or not re.fullmatch(r"[0-9a-f]{64}", parent_digest):
        raise ValueError("No original F12 ZIP SHA256")
    if (not isinstance(decision, dict) or decision.get("sourceF13") != F13_SHA or
            decision.get("sourceF12") != operator.F12_SHA or
            decision.get("operatorTrust") != "NOT_CONFIGURED" or
            decision.get("humanPhysicalAcceptance") != "OPEN" or
            decision.get("releaseDecision") != "NO_GO" or
            decision.get("authorizedToMerge") is not False or
            decision.get("authorizedToDeploy") is not False or
            decision.get("eligibleForIndependentHumanReview") is not False or
            decision.get("issues") != [] or
            decision.get("cryptographicallyVerifiedRequirements") != [] or
            decision.get("uncollectedRequirements") != list(operator.ROLE_REQUIREMENTS)):
        raise ValueError("F13 source evidence forged operator/human release acceptance")
    return {"parentF12ArchiveSha256": parent_digest, "humanObligations": len(operator.ROLE_REQUIREMENTS)}


def authenticate_f13(token: str, current_head: str, report: Path) -> dict:
    if not token or not isinstance(current_head, str) or not HEX40.fullmatch(current_head):
        raise ValueError("Read-only token and exact current head required")
    run = github.api_json(f"/repos/thiepn/pdf/actions/runs/{F13_RUN}", token)
    if (run.get("id") != F13_RUN or run.get("name") != F13_WORKFLOW or
            run.get("head_sha") != F13_SHA or run.get("status") != "completed" or
            run.get("conclusion") != "success"):
        raise ValueError("Original F13 workflow identity, head or conclusion invalid")
    collection = github.api_json(f"/repos/thiepn/pdf/actions/runs/{F13_RUN}/artifacts?per_page=100", token)
    found = [x for x in collection.get("artifacts", []) if x.get("name") == F13_ARTIFACT_NAME]
    if len(found) != 1:
        raise ValueError("Original F13 artifact missing or duplicated")
    source = found[0]
    if (source.get("id") != F13_ARTIFACT or source.get("expired") is not False or
            not isinstance(source.get("digest"), str) or not HEX64.fullmatch(source["digest"])):
        raise ValueError("Original F13 artifact no longer independently authenticated")
    raw = github.get_archive(F13_ARTIFACT, token)
    digest = hashlib.sha256(raw).hexdigest()
    if digest != source["digest"].removeprefix("sha256:"):
        raise ValueError("F13 original archive bytes fail GitHub SHA256")
    contents = load_original_zip(raw)
    # This independently revisits the entire F12 original archive and its F11 nested
    # custody, rather than just believing the F13 JSON's summary.
    with TemporaryDirectory(prefix="f14-authenticate-parent-") as temp:
        refreshed = f13_source.authenticate_source(token, F13_SHA, Path(temp) / "f12-original.json")
    if (refreshed.get("originalF12ZipSha256") != contents["parentF12ArchiveSha256"] or
            refreshed.get("verifiedSourceCustody") is not True or
            refreshed.get("humanRequirementsOpen") != 9):
        raise ValueError("Independent F12 custody revalidation diverged from F13")
    result = {"schemaVersion": 1, "originalF13Sha": F13_SHA,
              "f14ImplementationSha": current_head,
              "originalF13Run": F13_RUN, "originalF13Artifact": F13_ARTIFACT,
              "originalF13ZipSha256": digest,
              "verifiedF12OriginalSha": operator.F12_SHA,
              "verifiedF11OriginalSha": f13_source.F11_SHA,
              "verifiedF12ZipSha256": contents["parentF12ArchiveSha256"],
              "sourceChainIntegrity": True, "operatorSignersProvided": 0,
              "humanRequirementsOpen": 9, "releaseDecision": "NO_GO",
              "authorizedToMerge": False, "authorizedToDeploy": False}
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--current-head", required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(authenticate_f13(os.environ.get("F14_GITHUB_TOKEN", ""),
                                      args.current_head, args.report), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
