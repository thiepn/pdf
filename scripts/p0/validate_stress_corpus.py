#!/usr/bin/env python3
"""Validate Recovery P0 responsiveness fixtures before browser qualification."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[2]
CORPUS = ROOT / "tests" / "corpus" / "p0"
MANIFEST = CORPUS / "manifest.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    return digest


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    assert manifest.get("schemaVersion") == 1
    assert manifest.get("privacy") == "synthetic-only"
    files = manifest.get("files") or []
    assert len(files) == 4
    for entry in files:
        path = CORPUS / entry["filename"]
        assert path.is_file(), f"missing {path.name}"
        assert path.stat().st_size == entry["byteLength"], f"size mismatch for {path.name}"
        assert sha256(path) == entry["sha256"], f"checksum mismatch for {path.name}"
        expected = entry["expect"]
        document = fitz.open(path)
        try:
            assert document.page_count == expected["pages"], f"page count mismatch for {path.name}"
            first_text = document[0].get_text("text")
            assert expected["marker"] in first_text, f"marker missing in {path.name}"
        finally:
            document.close()
    print(json.dumps({"validated": len(files), "manifest": str(MANIFEST)}, indent=2))


if __name__ == "__main__":
    main()
