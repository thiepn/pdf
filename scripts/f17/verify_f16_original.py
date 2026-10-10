#!/usr/bin/env python3
"""F17 verify original qualified F16 Actions run/ZIP and independently refresh ancestry."""
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
import operator_release_evidence as f13
sys.path.insert(0, str(ROOT / "scripts" / "f16"))
import verify_f15_original as parent

F16_SHA = "cf2eca998ddb5807a9829d415092bdfe0cb5bb18"
F16_RUN = 38065225079
F16_ARTIFACT_ID = 11674672717
F16_NAME = "F16 independent owner authority and recovery NO_GO qualification"
F16_ARTIFACT_NAME = "f16-original-source-independent-human-recovery-no-go"
MEMBERS = {
    "f16-source/verified-f15-chain.json",
    "f16-operator/no-go.json",
}
HEX40 = re.compile(r"^[0-9a-f]{40}$")
DIGEST = re.compile(r"^sha256:([0-9a-f]{64})$")


def inspect_original(raw: bytes) -> dict:
    if not isinstance(raw, bytes) or not 128 <= len(raw) <= 8 * 1024 * 1024:
        raise ValueError("Missing/oversized original F16 evidence")
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        parts = archive.infolist()
        if len(parts) != 2 or {x.filename for x in parts} != MEMBERS:
            raise ValueError("Missing, repeated or extraneous F16 evidence members")
        for item in parts:
            mode = (item.external_attr >> 16) & 0o170000
            if item.is_dir() or mode == 0o120000 or not 1 <= item.file_size <= 256 * 1024:
                raise ValueError("Original ZIP contains untrusted or oversized member")
        chain = json.loads(archive.read("f16-source/verified-f15-chain.json"), object_pairs_hook=f13.no_duplicates)
        decision = json.loads(archive.read("f16-operator/no-go.json"), object_pairs_hook=f13.no_duplicates)
    if not isinstance(chain, dict) or not isinstance(decision, dict):
        raise ValueError("Original report is not an object")
    if (chain.get("schemaVersion") != 1 or chain.get("f16ImplementationSha") != F16_SHA or
            chain.get("originalF15Sha") != parent.F15_SOURCE_SHA or
            chain.get("originalF15RunId") != parent.F15_RUN_ID or
            chain.get("originalF15ArtifactId") != parent.F15_ARTIFACT_ID or
            chain.get("originalF14Sha") != parent.prior_source.F14_SOURCE_SHA or
            chain.get("originalF13Sha") != parent.prior_source.inherited.F13_SHA or
            chain.get("originalF12Sha") != f13.F12_SHA or
            chain.get("originalF11Sha") != parent.prior_source.inherited.f13_source.F11_SHA or
            chain.get("originalSourceChainVerified") is not True or
            chain.get("originalHumanApprovals") != 0 or
            chain.get("humanWitnessesProvided") is not False or
            chain.get("productionOperatorKeysProvided") is not False or
            chain.get("uncollectedHumanRequirements") != list(f13.ROLE_REQUIREMENTS) or
            chain.get("releaseDecision") != "NO_GO" or
            chain.get("postreleaseClosureAccepted") is not False or
            chain.get("authorizedToMerge") is not False or chain.get("authorizedToDeploy") is not False):
        raise ValueError("Untrusted F16 source lineage or forged human authority")
    ancestor_sha = chain.get("originalF15ZipSha256")
    if not isinstance(ancestor_sha, str) or not re.fullmatch(r"[0-9a-f]{64}", ancestor_sha):
        raise ValueError("Original F15 ZIP hash absent")
    if (decision.get("schemaVersion") != 1 or decision.get("f16ImplementationSha") != F16_SHA or
            decision.get("f15OriginalSha") != parent.F15_SOURCE_SHA or
            decision.get("operatorTrust") != "NOT_CONFIGURED" or
            decision.get("humanRequirementsOpen") != list(f13.ROLE_REQUIREMENTS) or
            decision.get("signatureClaimsChecked") != 0 or
            decision.get("independentRecoveryCeremonies") != 0 or
            decision.get("originalRecoveryBytesVerified") is not False or
            decision.get("originalHumanPhysicalAcceptance") is not False or
            decision.get("ownerReleaseAuthorized") is not False or
            decision.get("separatePostreleaseClosureAccepted") is not False or
            decision.get("issues") != [] or decision.get("releaseDecision") != "NO_GO" or
            decision.get("authorizedToMerge") is not False or decision.get("authorizedToDeploy") is not False):
        raise ValueError("F16 original operator NO_GO report altered")
    return {"f15ZipSha256": ancestor_sha, "humanRequirements": list(f13.ROLE_REQUIREMENTS)}


def authenticate(token: str, current_sha: str, destination: Path) -> dict:
    if not token or not isinstance(current_sha, str) or not HEX40.fullmatch(current_sha):
        raise ValueError("Source check requires read-only GitHub token and exact current SHA")
    run = github.api_json(f"/repos/thiepn/pdf/actions/runs/{F16_RUN}", token)
    if (run.get("id") != F16_RUN or run.get("name") != F16_NAME or
            run.get("head_sha") != F16_SHA or run.get("status") != "completed" or
            run.get("conclusion") != "success"):
        raise ValueError("Original F16 exact-head CI is not qualified")
    response = github.api_json(f"/repos/thiepn/pdf/actions/runs/{F16_RUN}/artifacts?per_page=100", token)
    records = response.get("artifacts")
    if not isinstance(records, list):
        raise ValueError("GitHub original artifacts metadata unavailable")
    found = [r for r in records if r.get("name") == F16_ARTIFACT_NAME]
    if len(found) != 1:
        raise ValueError("Expected exactly one original F16 artifact")
    record = found[0]
    given_digest = record.get("digest")
    if (record.get("id") != F16_ARTIFACT_ID or record.get("expired") is not False or
            not isinstance(given_digest, str) or not DIGEST.fullmatch(given_digest)):
        raise ValueError("Original GitHub F16 artifact authentication failed")
    raw = github.get_archive(F16_ARTIFACT_ID, token)
    archive_digest = hashlib.sha256(raw).hexdigest()
    if archive_digest != given_digest.removeprefix("sha256:"):
        raise ValueError("Original F16 ZIP SHA256 mismatch")
    checked = inspect_original(raw)
    with TemporaryDirectory(prefix="f17-independent-recovery-source-") as temporary:
        parent_review = parent.authenticate_source(token, F16_SHA, Path(temporary) / "parent.json")
    if (parent_review.get("originalF15ZipSha256") != checked["f15ZipSha256"] or
            parent_review.get("originalSourceChainVerified") is not True or
            parent_review.get("originalHumanApprovals") != 0):
        raise ValueError("Independently retrieved F15/F14/F13/F12/F11 custody differs")
    output = {"schemaVersion": 1, "f17ImplementationSha": current_sha,
              "f16OriginalSha": F16_SHA, "f16OriginalRunId": F16_RUN,
              "f16OriginalArtifactId": F16_ARTIFACT_ID, "f16OriginalZipSha256": archive_digest,
              "f15OriginalSha": parent.F15_SOURCE_SHA,
              "f15OriginalZipSha256": checked["f15ZipSha256"],
              "f14OriginalSha": parent.prior_source.F14_SOURCE_SHA,
              "f13OriginalSha": parent.prior_source.inherited.F13_SHA,
              "f12OriginalSha": f13.F12_SHA,
              "f11OriginalSha": parent.prior_source.inherited.f13_source.F11_SHA,
              "sourceChainIndependentlyAuthenticated": True,
              "humanRequirementsOpen": checked["humanRequirements"],
              "externalHumanApprovals": 0,
              "releaseDecision": "NO_GO", "authorizedToMerge": False,
              "authorizedToDeploy": False, "postreleaseClosureAccepted": False}
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(output, indent=2) + "\n")
    return output


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--current-head", required=True)
    parser.add_argument("--report", required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(authenticate(os.environ.get("F17_GITHUB_TOKEN", ""), args.current_head, args.report), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
