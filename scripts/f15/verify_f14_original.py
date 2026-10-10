#!/usr/bin/env python3
"""F15: reauthenticate F14's actual original source chain through GitHub read-only REST."""
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
sys.path.insert(0, str(ROOT / "scripts" / "f14"))
import verify_f13_original as inherited
sys.path.insert(0, str(ROOT / "scripts" / "f12"))
import verify_github_evidence as github
sys.path.insert(0, str(ROOT / "scripts" / "f13"))
import operator_release_evidence as operator

F14_SOURCE_SHA = "6aec03f2add1e613602ee6a3f13aaf0460ffd793"
F14_RUN_ID = 38060124317
F14_ARTIFACT_ID = 11672258555
F14_RUN_NAME = "F14 independent witnessed intake and recovery NO_GO"
F14_ARTIFACT_NAME = "f14-original-provenance-and-witness-no-go"
REQUIRED_MEMBERS = {
    "f14-source-custody/verified-original-source.json",
    "f14-intake/witnessed-no-go.json",
}
HEX40 = re.compile(r"^[0-9a-f]{40}$")
HEX64 = re.compile(r"^sha256:([0-9a-f]{64})$")


def inspect_original_archive(raw: bytes) -> dict:
    """Inspect only the exact two authenticated source reports; never unzip to disk."""
    if not isinstance(raw, bytes) or not 128 <= len(raw) <= 8 * 1024 * 1024:
        raise ValueError("Missing or oversized F14 evidence archive")
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        infos = archive.infolist()
        if len(infos) != 2 or {x.filename for x in infos} != REQUIRED_MEMBERS:
            raise ValueError("F14 original evidence members changed")
        for item in infos:
            kind = (item.external_attr >> 16) & 0o170000
            if item.is_dir() or kind == 0o120000 or not 1 <= item.file_size <= 256 * 1024:
                raise ValueError("Unsafe original evidence member")
        chain = json.loads(archive.read("f14-source-custody/verified-original-source.json"),
                           object_pairs_hook=operator.no_duplicates)
        no_go = json.loads(archive.read("f14-intake/witnessed-no-go.json"),
                            object_pairs_hook=operator.no_duplicates)
    if not isinstance(chain, dict) or not isinstance(no_go, dict):
        raise ValueError("Untrusted original F14 reports")
    if (chain.get("schemaVersion") != 1 or chain.get("f14ImplementationSha") != F14_SOURCE_SHA
            or chain.get("originalF13Sha") != inherited.F13_SHA
            or chain.get("verifiedF12OriginalSha") != operator.F12_SHA
            or chain.get("verifiedF11OriginalSha") != inherited.f13_source.F11_SHA
            or chain.get("originalF13Run") != inherited.F13_RUN
            or chain.get("originalF13Artifact") != inherited.F13_ARTIFACT
            or chain.get("sourceChainIntegrity") is not True
            or chain.get("humanRequirementsOpen") != 9
            or chain.get("operatorSignersProvided") != 0
            or chain.get("releaseDecision") != "NO_GO"
            or chain.get("authorizedToMerge") is not False
            or chain.get("authorizedToDeploy") is not False):
        raise ValueError("Original F14 source chain or NO_GO custody altered")
    parent_sha = chain.get("originalF13ZipSha256")
    if not isinstance(parent_sha, str) or not re.fullmatch(r"[0-9a-f]{64}", parent_sha):
        raise ValueError("Original F13 archive SHA256 missing")
    expected = list(operator.ROLE_REQUIREMENTS)
    if (no_go.get("schemaVersion") != 1 or no_go.get("f14ImplementationSha") != F14_SOURCE_SHA
            or no_go.get("f13SourceSha") != inherited.F13_SHA
            or no_go.get("trustStatus") != "NOT_CONFIGURED"
            or no_go.get("missingHumanRequirements") != expected
            or no_go.get("cryptographicClaims") != []
            or no_go.get("issues") != []
            or no_go.get("trustedHumanApprovalCount") != 0
            or no_go.get("actualWitnessedPhysicalApprovalsConfirmed") is not False
            or no_go.get("canSubmitForIndependentHumanReview") is not False
            or no_go.get("releaseDecision") != "NO_GO"
            or no_go.get("authorizedToMerge") is not False
            or no_go.get("authorizedToDeploy") is not False):
        raise ValueError("F14 original packet asserted absent human authority")
    return {"parentF13ZipSha256": parent_sha, "allHumanRequirementsOpen": expected}


def authenticate_f14(token: str, current_head: str, report: Path) -> dict:
    if not token or not isinstance(current_head, str) or not HEX40.fullmatch(current_head):
        raise ValueError("F15 requires real implementation SHA and read-only GitHub token")
    run = github.api_json(f"/repos/thiepn/pdf/actions/runs/{F14_RUN_ID}", token)
    if (run.get("id") != F14_RUN_ID or run.get("name") != F14_RUN_NAME or
            run.get("head_sha") != F14_SOURCE_SHA or run.get("status") != "completed" or
            run.get("conclusion") != "success"):
        raise ValueError("Original F14 run missing or not qualified")
    response = github.api_json(f"/repos/thiepn/pdf/actions/runs/{F14_RUN_ID}/artifacts?per_page=100", token)
    candidates = [a for a in response.get("artifacts", []) if a.get("name") == F14_ARTIFACT_NAME]
    if len(candidates) != 1:
        raise ValueError("Original F14 artifact absent or duplicated")
    metadata = candidates[0]
    expected = metadata.get("digest")
    if (metadata.get("id") != F14_ARTIFACT_ID or metadata.get("expired") is not False or
            not isinstance(expected, str) or not HEX64.fullmatch(expected)):
        raise ValueError("Original F14 artifact lacks trusted identity/SHA256")
    raw = github.get_archive(F14_ARTIFACT_ID, token)
    digest = hashlib.sha256(raw).hexdigest()
    if digest != expected.removeprefix("sha256:"):
        raise ValueError("Original GitHub artifact bytes mismatch")
    chain = inspect_original_archive(raw)
    with TemporaryDirectory(prefix="f15-independent-parent-") as temp:
        parent = inherited.authenticate_f13(token, F14_SOURCE_SHA, Path(temp) / "parent.json")
    if (parent.get("originalF13ZipSha256") != chain["parentF13ZipSha256"] or
            parent.get("sourceChainIntegrity") is not True or
            parent.get("humanRequirementsOpen") != 9):
        raise ValueError("Independently refreshed F13/F12/F11 custody disagrees")
    result = {"schemaVersion": 1, "f15ImplementationSha": current_head,
              "originalF14Sha": F14_SOURCE_SHA, "originalF14Run": F14_RUN_ID,
              "originalF14ArtifactId": F14_ARTIFACT_ID, "originalF14ArchiveSha256": digest,
              "originalF13Sha": inherited.F13_SHA, "originalF13ArchiveSha256": chain["parentF13ZipSha256"],
              "originalF12Sha": operator.F12_SHA,
              "originalF11Sha": inherited.f13_source.F11_SHA,
              "authenticatedIndependentSourceChain": True,
              "humanRequirementsOpen": chain["allHumanRequirementsOpen"],
              "recordedHumanAcceptances": 0, "operatorRootProvided": False,
              "releaseDecision": "NO_GO", "authorizedToMerge": False, "authorizedToDeploy": False}
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--current-head", required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(authenticate_f14(os.environ.get("F15_GITHUB_TOKEN", ""),
                                      args.current_head, args.report), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
