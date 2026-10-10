#!/usr/bin/env python3
"""F12: independently retrieve F11's original GitHub Actions run/artifact bytes.

Only read-only GitHub Actions access is used. No release or human approval action exists.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
from urllib import error, parse, request
import zipfile

F11_PARENT = "ab21d2d6e09033737d76867606454ba8f672c79f"
REPO = "thiepn/pdf"
RUNS = {
    "PDF Studio CI": 38035348951,
    "F11 cross-browser PDF and independent-reader certification": 38035348922,
    "Consumer performance budget": 38035348962,
    "R10 operational readiness policy": 38035348923,
}
ARTIFACTS = {
    "PDF Studio CI": (
        "phase30-playwright-report", "phase30-verified-dist",
        "phase30-source-audit", "phase11-corpus-evidence",
    ),
    "F11 cross-browser PDF and independent-reader certification": (
        "f11-crossbrowser-actual-export-evidence",
    ),
}
MAX_ZIP_BYTES = 80 * 1024 * 1024
MAX_EXTRACTED_BYTES = 512 * 1024 * 1024
SHA = re.compile(r"^[0-9a-f]{40}$")
DIGEST = re.compile(r"^sha256:([0-9a-f]{64})$")


def api_json(path: str, token: str) -> dict:
    if not path.startswith("/repos/" + REPO + "/"):
        raise ValueError("Untrusted API scope")
    url = "https://api.github.com" + path
    headers = {"Authorization": "Bearer " + token, "Accept": "application/vnd.github+json",
               "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "pdf-f12-readonly-custody"}
    with request.urlopen(request.Request(url, headers=headers), timeout=30) as stream:
        return json.load(stream)


class StopRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def get_archive(artifact_id: int, token: str) -> bytes:
    """Remove bearer token before following GitHub's signed blob-storage redirect."""
    path = f"https://api.github.com/repos/{REPO}/actions/artifacts/{artifact_id}/zip"
    headers = {"Authorization": "Bearer " + token, "Accept": "application/vnd.github+json",
               "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "pdf-f12-readonly-custody"}
    opener = request.build_opener(StopRedirect)
    try:
        response = opener.open(request.Request(path, headers=headers), timeout=30)
    except error.HTTPError as exc:
        if exc.code not in (302, 303, 307, 308):
            raise
        location = exc.headers.get("Location")
    else:
        try:
            raise ValueError("Expected signed GitHub artifact redirect, not API response bytes")
        finally:
            response.close()
    if not location or parse.urlparse(location).scheme != "https":
        raise ValueError("Artifact redirect missing HTTPS destination")
    # New request deliberately carries NO GitHub token to the signed artifact URL.
    with request.urlopen(request.Request(location, headers={"User-Agent": "pdf-f12-artifact-reader"}), timeout=120) as stream:
        archive = stream.read(MAX_ZIP_BYTES + 1)
    if len(archive) < 40 or len(archive) > MAX_ZIP_BYTES:
        raise ValueError("Missing/oversized original artifact")
    return archive


def inspect_zip_bytes(raw: bytes, name: str) -> dict:
    """Detect zip tampering and preserve all 21 real browser PDF export bytes."""
    with zipfile.ZipFile(io.BytesIO(raw), "r") as z:
        infos = z.infolist()
        if not infos or len(infos) > 10000:
            raise ValueError("Empty/oversized ZIP member table")
        names = set()
        size = 0
        exports: set[str] = set()
        report = None
        members = []
        for member in infos:
            path = member.filename
            pieces = path.replace("\\", "/").split("/")
            if (path.startswith("/") or "\\" in path or
                    any(part in ("", ".", "..") for part in pieces if not (member.is_dir() and part == "")) or
                    (member.external_attr >> 16) & 0o170000 == 0o120000):
                raise ValueError("Unsafe zip entry")
            if path in names:
                raise ValueError("Duplicate ZIP entry")
            names.add(path)
            if member.is_dir():
                continue
            size += member.file_size
            if size > MAX_EXTRACTED_BYTES or member.file_size > MAX_EXTRACTED_BYTES:
                raise ValueError("ZIP decompression budget exceeded")
            payload = z.read(member)
            if len(payload) != member.file_size:
                raise ValueError("ZIP member truncated")
            digest = hashlib.sha256(payload).hexdigest()
            members.append({"path": path, "bytes": len(payload), "sha256": digest})
            if name == "f11-crossbrowser-actual-export-evidence":
                if path == "artifacts/f11-crossbrowser-report.json":
                    report = json.loads(payload)
                elif path.startswith("artifacts/f10-exports/") or path.startswith("artifacts/f11-exports/"):
                    if path.endswith(".pdf"):
                        if not payload.startswith(b"%PDF-"):
                            raise ValueError("Untrusted browser export PDF")
                        exports.add(path)
        if name == "f11-crossbrowser-actual-export-evidence":
            expected = {
                f"artifacts/f10-exports/{browser}/{fixture}.pdf"
                for browser in ("chromium", "firefox", "webkit")
                for fixture in ("forms", "comments-measurements", "optimization", "batch-alpha", "batch-beta")
            } | {
                f"artifacts/f11-exports/{browser}/{fixture}-edited.pdf"
                for browser in ("chromium", "firefox", "webkit")
                for fixture in ("rotated-crop", "nonzero-origin")
            }
            if exports != expected:
                raise ValueError("Expected 21 exact original browser export paths")
            if not isinstance(report, dict) or report.get("qualified") is not True or report.get("crossBrowserGeometryIssues") != []:
                raise ValueError("F11 report did not certify all original exports")
            actual = report.get("results")
            if not isinstance(actual, list) or len(actual) != 3:
                raise ValueError("F11 browser report incomplete")
            if {row.get("browser") for row in actual} != {"chromium", "firefox", "webkit"}:
                raise ValueError("F11 expected browser set missing")
            if any(row.get("passed") is not True or len(row.get("cases", [])) != 7 or
                   not all(case.get("passed") is True for case in row["cases"]) for row in actual):
                raise ValueError("F11 missing failed/pending browser export")
        return {"members": sorted(members, key=lambda x: x["path"]), "exportCount": len(exports)}


def verify(source_sha: str, implementation_sha: str, token: str, custody: Path) -> tuple[list[dict], dict]:
    if source_sha != F11_PARENT or not SHA.fullmatch(implementation_sha) or not token:
        raise ValueError("Missing/pinned source SHA, implementation head, or read-only GitHub credentials")
    if custody.exists() and (custody.is_symlink() or any(custody.iterdir())):
        raise ValueError("Custody must be an empty, nonsymlinked directory")
    custody.mkdir(parents=True, exist_ok=True)
    observed = []
    verified = []
    for name, run_id in RUNS.items():
        run = api_json(f"/repos/{REPO}/actions/runs/{run_id}", token)
        if (run.get("id") != run_id or run.get("name") != name or
                run.get("head_sha") != source_sha or run.get("status") != "completed" or
                run.get("conclusion") != "success"):
            raise ValueError(f"Unqualified live GitHub workflow {name}")
        observed.append({"name": name, "id": run_id, "headSha": source_sha, "conclusion": "success"})
        required = ARTIFACTS.get(name, ())
        if not required:
            continue
        reply = api_json(f"/repos/{REPO}/actions/runs/{run_id}/artifacts?per_page=100", token)
        matches = reply.get("artifacts")
        if not isinstance(matches, list):
            raise ValueError("GitHub artifacts metadata unavailable")
        for artifact_name in required:
            candidates = [a for a in matches if a.get("name") == artifact_name]
            if len(candidates) != 1:
                raise ValueError(f"Missing/duplicate original GitHub artifact: {artifact_name}")
            record = candidates[0]
            digest = record.get("digest")
            if (not isinstance(digest, str) or not DIGEST.fullmatch(digest) or
                    record.get("expired") is not False or type(record.get("id")) is not int or
                    type(record.get("size_in_bytes")) is not int or record["size_in_bytes"] <= 0):
                raise ValueError("No trusted GitHub artifact digest/identity: " + artifact_name)
            raw = get_archive(record["id"], token)
            actual = hashlib.sha256(raw).hexdigest()
            if actual != digest.removeprefix("sha256:"):
                raise ValueError("Original artifact bytes do not match GitHub SHA256: " + artifact_name)
            inventory = inspect_zip_bytes(raw, artifact_name)
            filename = f"{run_id}-{record['id']}-{artifact_name}.zip"
            (custody / filename).write_bytes(raw)
            verified.append({"workflow": name, "runId": run_id, "artifactId": record["id"],
                             "name": artifact_name, "zipSha256": actual, "bytes": len(raw),
                             "exportCount": inventory["exportCount"], "members": inventory["members"]})
    if len(verified) != sum(map(len, ARTIFACTS.values())):
        raise ValueError("Original custody incomplete")
    return observed, {"schemaVersion": 1, "sourceSha": source_sha, "implementationSha": implementation_sha,
                      "origin": "Direct read-only GitHub REST and verified original artifact ZIP bytes",
                      "status": "EVIDENCE_ONLY", "humanAcceptance": "OPEN",
                      "artifactEvidence": verified}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--implementation-sha", required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    run_rows, metadata = verify(args.source_sha, args.implementation_sha,
                                os.environ.get("F12_GITHUB_TOKEN", ""), args.output_dir / "custody")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "runs.json").write_text(json.dumps(run_rows, indent=2) + "\n")
    (args.output_dir / "github-original-artifacts.json").write_text(json.dumps(metadata, indent=2) + "\n")
    print(json.dumps({"verifiedRunCount": len(run_rows),
                      "downloadedOriginalArtifactCount": len(metadata["artifactEvidence"]),
                      "sourceSha": metadata["sourceSha"], "implementationSha": metadata["implementationSha"],
                      "humanAcceptance": "OPEN", "releaseDecision": "DENIED"}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
