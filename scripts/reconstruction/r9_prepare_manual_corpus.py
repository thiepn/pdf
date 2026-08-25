#!/usr/bin/env python3
"""Prepare a privacy-safe, local-only corpus for R9 manual human qualification."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = ROOT / ".r9-manual-corpus"
SOURCE_DIR = ROOT / "tests" / "corpus" / "generated"

COPIED_FIXTURES = {
    "plain-text.pdf": ["D01", "D04", "D05"],
    "mixed-pages.pdf": ["D07", "D10"],
    "redaction-source.pdf": ["D06"],
    "forms.pdf": ["D18"],
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def render_source_image(path: Path, label: str, variant: int) -> None:
    doc = fitz.open()
    page = doc.new_page(width=600, height=400)
    page.draw_rect(fitz.Rect(30, 30, 570, 370), color=(0.1, 0.2, 0.35), width=4)
    fill = (0.88 - variant * 0.04, 0.91, 0.95)
    page.draw_rect(fitz.Rect(70, 90, 530, 320), color=(0.3, 0.4, 0.55), fill=fill, width=2)
    page.insert_text((100, 150), "PDF Studio R9", fontsize=30)
    page.insert_text((100, 205), label, fontsize=28)
    page.insert_text((100, 260), "Purpose-built non-sensitive image", fontsize=18)
    pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    pixmap.save(path)
    doc.close()


def generate_ocr_pdf(path: Path) -> None:
    source = fitz.open()
    page = source.new_page(width=595, height=842)
    page.insert_text((72, 170), "R9 OCR SAMPLE", fontsize=34)
    page.insert_text((72, 250), "Purpose-built image-only page", fontsize=24)
    page.insert_text((72, 330), "SEARCHABLE AFTER OCR 2026", fontsize=28)
    page.draw_rect(fitz.Rect(60, 110, 535, 390), color=(0, 0, 0), width=2)
    pixmap = page.get_pixmap(matrix=fitz.Matrix(2.5, 2.5), alpha=False)
    temp_png = path.with_suffix(".source.png")
    pixmap.save(temp_png)
    source.close()

    doc = fitz.open()
    out_page = doc.new_page(width=595, height=842)
    out_page.insert_image(out_page.rect, filename=str(temp_png))
    doc.save(path, garbage=4, deflate=True)
    doc.close()
    temp_png.unlink()

    check = fitz.open(path)
    if check[0].get_text().strip():
        check.close()
        raise RuntimeError("OCR fixture unexpectedly contains a text layer")
    check.close()


def generate_compress_source(path: Path) -> None:
    """Create deliberately uncompressed, repetitive PDF content for a fair compression task."""
    doc = fitz.open()
    repeated = "R9 COMPRESSIBLE CONTENT " * 4
    for page_index in range(60):
        page = doc.new_page(width=595, height=842)
        page.insert_text((48, 48), f"R9 COMPRESSION SOURCE PAGE {page_index + 1:02d}", fontsize=14)
        for line in range(32):
            y = 78 + line * 22
            page.insert_text((48, y), f"{line + 1:02d} {repeated}", fontsize=8)
        for box in range(12):
            x0 = 48 + (box % 4) * 120
            y0 = 760 + (box // 4) * 18
            page.draw_rect(fitz.Rect(x0, y0, x0 + 90, y0 + 12), color=(0.2, 0.2, 0.2), fill=(0.95, 0.95, 0.95), width=0.5)
    doc.save(path, garbage=0, deflate=False, clean=False)
    doc.close()
    if path.stat().st_size < 100_000:
        raise RuntimeError("Compression fixture is unexpectedly small")


def add_entry(entries: list[dict], path: Path, kind: str, task_ids: list[str], **extra: object) -> None:
    entries.append({
        "filename": path.name,
        "kind": kind,
        "task_ids": task_ids,
        "sha256": sha256(path),
        "bytes": path.stat().st_size,
        **extra,
    })


def prepare(output: Path) -> dict:
    output.mkdir(parents=True, exist_ok=True)

    entries: list[dict] = []
    for filename, task_ids in COPIED_FIXTURES.items():
        source = SOURCE_DIR / filename
        if not source.is_file():
            raise FileNotFoundError(f"Required committed fixture is missing: {source}")
        target = output / filename
        shutil.copyfile(source, target)
        add_entry(entries, target, "committed-pdf-fixture", task_ids)

    photo1 = output / "photo-source-1.png"
    photo2 = output / "photo-source-2.png"
    render_source_image(photo1, "PHOTO SOURCE ONE", 0)
    render_source_image(photo2, "PHOTO SOURCE TWO", 1)
    add_entry(entries, photo1, "generated-image-source", ["D19"])
    add_entry(entries, photo2, "generated-image-source", ["D19"])

    ocr_pdf = output / "ocr-scan.pdf"
    generate_ocr_pdf(ocr_pdf)
    add_entry(entries, ocr_pdf, "generated-image-only-pdf", ["D15"], expected_text_layer=False)

    compress_pdf = output / "compress-source.pdf"
    generate_compress_source(compress_pdf)
    add_entry(entries, compress_pdf, "generated-uncompressed-pdf", ["D14"], expected_compressible=True)

    manifest = {
        "schema": 2,
        "corpus_id": "r9-manual-v1",
        "privacy": "Purpose-built or committed synthetic fixtures only; no personal/private document content.",
        "files": sorted(entries, key=lambda item: item["filename"]),
    }
    manifest_path = output / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    manifest = prepare(args.output.resolve())
    print(json.dumps({
        "status": "R9_MANUAL_CORPUS_READY",
        "corpus_id": manifest["corpus_id"],
        "output": str(args.output.resolve()),
        "files": len(manifest["files"]),
    }, indent=2))


if __name__ == "__main__":
    main()
