#!/usr/bin/env python3
"""Generate deterministic local-only PDFs for P0 responsiveness qualification."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "tests" / "corpus" / "p0"
OUT.mkdir(parents=True, exist_ok=True)
A4 = fitz.paper_rect("a4")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def save(doc: fitz.Document, name: str) -> Path:
    path = OUT / name
    if path.exists():
        path.unlink()
    doc.save(path, garbage=4, deflate=True)
    doc.close()
    return path


def dense_text() -> Path:
    doc = fitz.open()
    # Deliberately exceeds the editor's per-page paragraph-reconstruction budget.
    # Text is split into many independent draw operations so the inspector sees a
    # pathological object count without relying on a private user document.
    for page_index in range(2):
        page = doc.new_page(width=A4.width, height=A4.height)
        page.insert_text((24, 24), f"P0_DENSE_TEXT_PAGE_{page_index + 1}", fontsize=7)
        for index in range(1_200):
            column = index % 12
            row = (index // 12) % 100
            x = 24 + column * 46
            y = 40 + row * 7.5
            page.insert_text((x, y), f"T{page_index + 1}_{index:04d}", fontsize=4.5)
    return save(doc, "dense-text.pdf")


def dense_vectors() -> Path:
    doc = fitz.open()
    page = doc.new_page(width=A4.width, height=A4.height)
    page.insert_text((24, 24), "P0_DENSE_VECTOR_MARKER", fontsize=8)
    # More than the fallback table-recovery vector threshold, distributed over a
    # regular grid so pairwise connectivity would be expensive without the guard.
    for index in range(1_600):
        column = index % 40
        row = index // 40
        x = 18 + column * 14
        y = 38 + row * 18
        page.draw_rect(fitz.Rect(x, y, x + 10, y + 10), color=(0, 0, 0), width=0.4)
    return save(doc, "dense-vectors.pdf")


def thousand_pages() -> Path:
    doc = fitz.open()
    for index in range(1_000):
        page = doc.new_page(width=A4.width, height=A4.height)
        page.insert_text((36, 52), f"P0_PAGE_{index + 1:04d}", fontsize=8)
    return save(doc, "large-1000-pages.pdf")


def mixed_content() -> Path:
    doc = fitz.open()
    for page_index in range(50):
        page = doc.new_page(width=A4.width, height=A4.height)
        page.insert_text((42, 54), f"P0_MIXED_PAGE_{page_index + 1:03d}", fontsize=10)
        for row in range(24):
            page.insert_text((42, 82 + row * 22), f"Line {row + 1}: deterministic mixed-content responsiveness fixture.", fontsize=8)
        for column in range(12):
            x = 42 + column * 42
            page.draw_rect(fitz.Rect(x, 650, x + 28, 680), color=(0.2, 0.2, 0.2), fill=(0.9, 0.9, 0.9), width=0.5)
    return save(doc, "mixed-50-pages.pdf")


def main() -> None:
    for path in OUT.glob("*"):
        if path.is_file():
            path.unlink()

    files = [dense_text(), dense_vectors(), thousand_pages(), mixed_content()]
    expectations = {
        "dense-text.pdf": {"pages": 2, "marker": "P0_DENSE_TEXT_PAGE_1", "kind": "dense-text"},
        "dense-vectors.pdf": {"pages": 1, "marker": "P0_DENSE_VECTOR_MARKER", "kind": "dense-vectors"},
        "large-1000-pages.pdf": {"pages": 1000, "marker": "P0_PAGE_0001", "kind": "large-pages"},
        "mixed-50-pages.pdf": {"pages": 50, "marker": "P0_MIXED_PAGE_001", "kind": "mixed"},
    }
    manifest = {
        "schemaVersion": 1,
        "generatedBy": "PDF Studio Recovery P0",
        "privacy": "synthetic-only",
        "files": [
            {
                "filename": path.name,
                "byteLength": path.stat().st_size,
                "sha256": sha256(path),
                "expect": expectations[path.name],
            }
            for path in sorted(files)
        ],
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(OUT), "files": len(files)}, indent=2))


if __name__ == "__main__":
    main()
