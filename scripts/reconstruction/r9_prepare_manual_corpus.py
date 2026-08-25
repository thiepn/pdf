#!/usr/bin/env python3
"""Prepare a privacy-safe, local-only corpus for R9 manual human qualification."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

import fitz
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = ROOT / ".r9-manual-corpus"
SOURCE_DIR = ROOT / "tests" / "corpus" / "generated"

COPIED_FIXTURES = {
    "plain-text.pdf": ["D01", "D04", "D05"],
    "mixed-pages.pdf": ["D07", "D10"],
    "redaction-source.pdf": ["D06"],
    "forms.pdf": ["D18"],
    "large-200-pages.pdf": ["D14"],
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def generate_photo(path: Path, label: str, accent: int) -> None:
    image = Image.new("RGB", (1200, 800), (242, 242, 242))
    draw = ImageDraw.Draw(image)
    draw.rectangle((80, 80, 1120, 720), outline=(40 + accent, 60, 90), width=12)
    draw.rectangle((150, 170, 1050, 630), fill=(220, 225 + accent // 8, 232))
    draw.text((180, 220), "PDF Studio R9", fill=(20, 20, 20))
    draw.text((180, 300), label, fill=(20, 20, 20))
    draw.text((180, 380), "Purpose-built non-sensitive source image", fill=(20, 20, 20))
    image.save(path, format="PNG", optimize=True)


def generate_ocr_pdf(path: Path) -> None:
    raster = Image.new("RGB", (1654, 2339), "white")
    draw = ImageDraw.Draw(raster)
    draw.text((150, 220), "R9 OCR SAMPLE", fill="black")
    draw.text((150, 360), "Purpose-built image-only page", fill="black")
    draw.text((150, 500), "SEARCHABLE AFTER OCR 2026", fill="black")
    temp_png = path.with_suffix(".source.png")
    raster.save(temp_png, format="PNG", optimize=True)

    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_image(page.rect, filename=str(temp_png))
    doc.save(path, garbage=4, deflate=True)
    doc.close()
    temp_png.unlink()


def prepare(output: Path) -> dict:
    output.mkdir(parents=True, exist_ok=True)

    entries: list[dict] = []
    for filename, task_ids in COPIED_FIXTURES.items():
        source = SOURCE_DIR / filename
        if not source.is_file():
            raise FileNotFoundError(f"Required committed fixture is missing: {source}")
        target = output / filename
        shutil.copyfile(source, target)
        entries.append({
            "filename": filename,
            "kind": "committed-pdf-fixture",
            "task_ids": task_ids,
            "sha256": sha256(target),
            "bytes": target.stat().st_size,
        })

    photo1 = output / "photo-source-1.png"
    photo2 = output / "photo-source-2.png"
    generate_photo(photo1, "PHOTO SOURCE ONE", 0)
    generate_photo(photo2, "PHOTO SOURCE TWO", 40)
    for photo in (photo1, photo2):
        entries.append({
            "filename": photo.name,
            "kind": "generated-image-source",
            "task_ids": ["D19"],
            "sha256": sha256(photo),
            "bytes": photo.stat().st_size,
        })

    ocr_pdf = output / "ocr-scan.pdf"
    generate_ocr_pdf(ocr_pdf)
    entries.append({
        "filename": ocr_pdf.name,
        "kind": "generated-image-only-pdf",
        "task_ids": ["D15"],
        "sha256": sha256(ocr_pdf),
        "bytes": ocr_pdf.stat().st_size,
        "expected_text_layer": False,
    })

    manifest = {
        "schema": 1,
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
