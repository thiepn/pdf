#!/usr/bin/env python3
"""F16 authenticate F15's ORIGINAL GitHub artifacts and F14/F13/F12/F11 custody.

This verifier is strictly read-only. CI evidence is never a human approval.
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
sys.path.insert(0, str(ROOT / "scripts" / "f15"))
import verify_f14_original as prior_source
sys.path.insert(0, str(ROOT / "scripts" / "f12"))
import verify_github_evidence as github
sys.path.insert(0, str(ROOT / "scripts" / "f13"))
import operator_release_evidence as operator

F15_SOURCE_SHA = "6952cb6d0c210c0a910bfc06accefc778f68f44d"
F15_RUN_ID = 38062370006
F15_ARTIFACT_ID = 11673996595
F15_RUN_NAME = "F15 independent owner/closure and original-restore NO_GO"
F15_ARTIFACT_NAME = "f15-source-bound-independent-owner-release-no-go"
MEMBERS = {
    "f15-source-provenance/authenticated-f14-original.json",
    "f15-independent-owner/no-go.json",
}
HEX40 = re.compile(r"^[0-9a-f]{40}$")
DIGEST = re.compile(r"^sha256:([0-9a-f]{64})$")


def verify_original_bytes(raw: bytes) -> dict:
    if not isinstance(raw, bytes) or not 128 <= len(raw) <= 8 * 1024 * 1024:
        raise ValueError("Missing or oversized original F15 ZIP")
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        records = archive.infolist()
        if len(records) != 2 or {item.filename for item in records} != MEMBERS:
            raise ValueError("Original F15 archive has missing, duplicate or additional members")
        for item in records:
            kind = (item.external_attr >> 16) & 0o170000
            if item.is_dir() or kind == 0o120000 or not 1 <= item.file_size <= 256 * 1024:
                raise ValueError("Untrusted original F15 archive member")
        source = json.loads(archive.read("f15-source-provenance/authenticated-f14-original.json"),
                            object_pairs_hook=operator.no_duplicates)
        no_go = json.loads(archive.read("f15-independent-owner/no-go.json"),
                            object_pairs_hook=operator.no_duplicates)
    if not isinstance(source, dict) or not isinstance(no_go, dict):
        raise ValueError("Malformed original source or operator packet")
    if (source.get("schemaVersion") != 1 or source.get("f15ImplementationSha") != F15_SOURCE_SHA or
            source.get("originalF14Sha") != prior_source.F14_SOURCE_SHA or
            source.get("originalF14Run") != prior_source.F14_RUN_ID or
            source.get("originalF14ArtifactId") != prior_source.F14_ARTIFACT_ID or
            source.get("originalF13Sha") != prior_source.inherited.F13_SHA or
            source.get("originalF12Sha") != operator.F12_SHA or
            source.get("originalF11Sha") != prior_source.inherited.f13_source.F11_SHA or
            source.get("authenticatedIndependentSourceChain") is not True or
            source.get("recordedHumanAcceptances") != 0 or
            source.get("operatorRootProvided") is not False or
            source.get("humanRequirementsOpen") != list(operator.ROLE_REQUIREMENTS) or
            source.get("releaseDecision") != "NO_GO" or
            source.get("authorizedToMerge") is not False or
            source.get("authorizedToDeploy") is not False):
        raise ValueError("Original F15 source chain or open human requirements were changed")
    parent_sha = source.get("originalF14ArchiveSha256")
    if not isinstance(parent_sha, str) or not re.fullmatch(r"[0-9a-f]{64}", parent_sha):
        raise ValueError("Original F14 artifact SHA256 missing")
    if (no_go.get("schemaVersion") != 1 or no_go.get("f15ImplementationSha") != F15_SOURCE_SHA or
            no_go.get("f14SourceSha") != prior_source.F14_SOURCE_SHA or
            no_go.get("operatorTrustStatus") != "NOT_CONFIGURED" or
            no_go.get("humanRequirementsOpen") != list(operator.ROLE_REQUIREMENTS) or
            no_go.get("operatorReviewStagesCryptographicallyVerified") != [] or
            no_go.get("evidenceObjectsStructurallyVerified") != [] or
            no_go.get("issues") != [] or
            no_go.get("independentOperatorReviewEligible") is not False or
            no_go.get("genuinePhysicalAcceptanceRecorded") is not False or
            no_go.get("postreleaseClosureAccepted") is not False or
            no_go.get("releaseDecision") != "NO_GO" or
            no_go.get("authorizedToMerge") is not False or
            no_go.get("authorizedToDeploy") is not False):
        raise ValueError("Original F15 packet asserted nonexistent operator/human permission")
    return {"parentF14ArchiveSha256": parent_sha, "humanRequirementsOpen": list(operator.ROLE_REQUIREMENTS)}


def authenticate_source(token: str, f16_head: str, output: Path) -> dict:
    if not token or not isinstance(f16_head, str) or not HEX40.fullmatch(f16_head):
        raise ValueError("F16 requires exact implementation SHA and read-only GitHub token")
    run = github.api_json(f"/repos/thiepn/pdf/actions/runs/{F15_RUN_ID}", token)
    if (run.get("id") != F15_RUN_ID or run.get("name") != F15_RUN_NAME or
            run.get("head_sha") != F15_SOURCE_SHA or run.get("status") != "completed" or
            run.get("conclusion") != "success"):
        raise ValueError("Original F15 exact-head workflow is unqualified")
    response = github.api_json(f"/repos/thiepn/pdf/actions/runs/{F15_RUN_ID}/artifacts?per_page=100", token)
    artifacts = response.get("artifacts")
    if not isinstance(artifacts, list):
        raise ValueError("Original artifacts metadata unavailable")
    found = [a for a in artifacts if a.get("name") == F15_ARTIFACT_NAME]
    if len(found) != 1:
        raise ValueError("Original F15 artifact missing/duplicated")
    item = found[0]
    if (item.get("id") != F15_ARTIFACT_ID or item.get("expired") is not False or
            not isinstance(item.get("digest"), str) or not DIGEST.fullmatch(item["digest"])):
        raise ValueError("Original F15 artifact has no authenticated ZIP digest")
    raw = github.get_archive(F15_ARTIFACT_ID, token)
    digest = hashlib.sha256(raw).hexdigest()
    if digest != item["digest"].removeprefix("sha256:"):
        raise ValueError("GitHub original F15 artifact ZIP byte SHA256 mismatch")
    source = verify_original_bytes(raw)
    with TemporaryDirectory(prefix="f16-parent-custody-") as scratch:
        verified_parent = prior_source.authenticate_f14(token, F15_SOURCE_SHA, Path(scratch) / "f14.json")
    if (verified_parent.get("originalF14ArchiveSha256") != source["parentF14ArchiveSha256"] or
            verified_parent.get("authenticatedIndependentSourceChain") is not True or
            verified_parent.get("recordedHumanAcceptances") != 0):
        raise ValueError("Independent original F14/F13/F12/F11 reinspection disagrees")
    result = {"schemaVersion": 1, "f16ImplementationSha": f16_head,
              "originalF15Sha": F15_SOURCE_SHA, "originalF15RunId": F15_RUN_ID,
              "originalF15ArtifactId": F15_ARTIFACT_ID, "originalF15ZipSha256": digest,
              "originalF14Sha": prior_source.F14_SOURCE_SHA,
              "originalF14ZipSha256": source["parentF14ArchiveSha256"],
              "originalF13Sha": prior_source.inherited.F13_SHA,
              "originalF12Sha": operator.F12_SHA,
              "originalF11Sha": prior_source.inherited.f13_source.F11_SHA,
              "originalSourceChainVerified": True,
              "uncollectedHumanRequirements": source["humanRequirementsOpen"],
              "originalHumanApprovals": 0,
              "humanWitnessesProvided": False, "productionOperatorKeysProvided": False,
              "releaseDecision": "NO_GO", "authorizedToMerge": False,
              "authorizedToDeploy": False, "postreleaseClosureAccepted": False}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + "\n")
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--f16-head", required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(authenticate_source(os.environ.get("F16_GITHUB_TOKEN", ""),
                                         args.f16_head, args.report), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
