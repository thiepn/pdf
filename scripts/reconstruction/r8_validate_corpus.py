#!/usr/bin/env python3
"""Validate R8 aggregate corpus size and provenance without storing third-party bytes."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CORPUS_ROOT = ROOT / "tests" / "corpus"
EVIDENCE_DIR = ROOT / "docs" / "reconstruction" / "evidence"
EXTERNAL_MANIFEST = CORPUS_ROOT / "r8-external" / "manifest.json"
MIN_AGGREGATE = 100
MIN_EXTERNAL = 25


def pdf_count(relative: str) -> int:
    directory = CORPUS_ROOT / relative
    return sum(1 for path in directory.rglob("*.pdf") if path.is_file()) if directory.exists() else 0


def main() -> None:
    if not EXTERNAL_MANIFEST.exists():
        raise SystemExit("R8 external manifest is missing")
    external = json.loads(EXTERNAL_MANIFEST.read_text(encoding="utf-8"))
    documents = external.get("documents", [])
    if len(documents) < MIN_EXTERNAL:
        raise SystemExit(f"R8 requires at least {MIN_EXTERNAL} external documents")

    for item in documents:
        path = CORPUS_ROOT / "r8-external" / item["filename"]
        if not path.exists():
            raise SystemExit(f"missing external fixture: {path.name}")
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != item["sha256"]:
            raise SystemExit(f"hash mismatch for external fixture: {path.name}")

    counts = {
        "phase11_generated": pdf_count("generated"),
        "phase28_adversarial": pdf_count("phase28"),
        "p8_compatibility": pdf_count("p8"),
        "r8_external": pdf_count("r8-external"),
    }
    aggregate = sum(counts.values())
    if aggregate < MIN_AGGREGATE:
        raise SystemExit(f"R8 aggregate corpus has {aggregate} PDFs; requires at least {MIN_AGGREGATE}")

    report = {
        "schema": 1,
        "status": "PASS",
        "commit_sha": os.getenv("R8_COMMIT_SHA") or os.getenv("GITHUB_SHA") or "local",
        "corpus_id": external.get("corpus_id"),
        "external_source_commit": external.get("source_commit"),
        "counts": counts,
        "aggregate_pdf_count": aggregate,
        "minimum_required": MIN_AGGREGATE,
        "privacy": "Only public/purpose-built corpus identifiers, hashes, and counts are recorded as evidence.",
    }
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    report_path = EVIDENCE_DIR / "r8-corpus-report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
