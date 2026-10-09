#!/usr/bin/env python3
"""Independently inspect already published PDF Studio GitHub Pages assets.

A matching version/channel and internally consistent artifact do not prove the
running Pages bits came from the verified Git tag: tag-to-artifact attestation and
human release review remain separate mandatory gates.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen


def assess_live_assets(metadata: dict, integrity: dict, offline: dict, service_worker: str, html: str) -> list[str]:
    failures: list[str] = []
    if metadata.get("schemaVersion") != 1 or metadata.get("version") != "7.1.4" or metadata.get("channel") != "stable":
        failures.append("Published release-metadata.json does not report stable v7.1.4")
    epoch = metadata.get("buildEpoch")
    if not isinstance(epoch, (float, int)) or epoch < 0:
        failures.append("Published release metadata lacks a valid buildEpoch")
    if integrity.get("schemaVersion") != 1 or not isinstance(integrity.get("fileCount"), int) or integrity["fileCount"] < 1:
        failures.append("Published asset integrity manifest is malformed")
    if not isinstance(integrity.get("files"), list) or len(integrity["files"]) != integrity.get("fileCount"):
        failures.append("Published asset integrity fileCount does not match file records")
    if not isinstance(offline.get("assets", offline.get("core", [])), (dict, list)):
        failures.append("Published offline asset inventory is malformed")
    if "PDF Studio" not in html:
        failures.append("Published URL did not serve the PDF Studio application shell")
    for name, token in (
        ("version", 'const RELEASE_VERSION = "7.1.4";'),
        ("channel", 'const RELEASE_CHANNEL = "stable";'),
        ("epoch", f'const RELEASE_BUILD_EPOCH = Number("{epoch}")')
    ):
        if token not in service_worker:
            failures.append(f"Published service worker {name} differs from release metadata")
    if "__LPS_RELEASE_" in service_worker:
        failures.append("Unresolved service worker release placeholders")
    return failures


def probe(base: str) -> dict:
    parsed = urlsplit(base)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("A public HTTPS Pages base URL is required")
    if parsed.hostname in {"localhost", "127.0.0.1", "::1"} or parsed.hostname.endswith((".local", ".internal")):
        raise ValueError("Private/local targets are not a valid published Pages origin")
    root = base.rstrip("/") + "/"
    def fetch(filename: str) -> bytes:
        request = Request(urljoin(root, filename), headers={"Accept": "application/json, text/html, */*",
                                                               "Cache-Control": "no-cache", "User-Agent": "pdf-studio-d17-qualification"})
        with urlopen(request, timeout=15) as response:
            if response.status != 200:
                raise RuntimeError(f"{filename}: HTTP {response.status}")
            return response.read(8_000_001)
    payloads = {file: fetch(file) for file in (
        "", "release-metadata.json", "release-integrity.json", "offline-assets.json", "sw.js"
    )}
    metadata = json.loads(payloads["release-metadata.json"])
    integrity = json.loads(payloads["release-integrity.json"])
    offline = json.loads(payloads["offline-assets.json"])
    failures = assess_live_assets(metadata, integrity, offline,
                                  payloads["sw.js"].decode("utf-8", "replace"),
                                  payloads[""].decode("utf-8", "replace"))
    return {
        "live_pages_reachable": True,
        "internal_asset_checks_passed": not failures,
        "live_release": {"version": metadata.get("version"), "channel": metadata.get("channel"),
                         "buildEpoch": metadata.get("buildEpoch")},
        "integrity_sha256": hashlib.sha256(payloads["release-integrity.json"]).hexdigest(),
        "service_worker_sha256": hashlib.sha256(payloads["sw.js"]).hexdigest(),
        "errors": failures,
        "tag_to_live_artifact_attested": False,
        "release_approved": False
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True, help="Actual published PDF Studio Pages URL; no guessed hostname")
    args = parser.parse_args()
    try:
        result = probe(args.url)
    except (ValueError, OSError, HTTPError, URLError, json.JSONDecodeError, RuntimeError) as exc:
        result = {"live_pages_reachable": False, "internal_asset_checks_passed": False,
                  "errors": [str(exc)], "tag_to_live_artifact_attested": False, "release_approved": False}
    print(json.dumps(result, indent=2, sort_keys=True))
    return int(not result["internal_asset_checks_passed"])


if __name__ == "__main__":
    raise SystemExit(main())
