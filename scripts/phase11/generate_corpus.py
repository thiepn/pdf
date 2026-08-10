#!/usr/bin/env python3
"""Generate a deterministic, redistributable Phase 11 PDF validation corpus."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "tests" / "corpus" / "generated"
OUT.mkdir(parents=True, exist_ok=True)

A4 = fitz.paper_rect("a4")
LETTER = fitz.paper_rect("letter")


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def save(doc: fitz.Document, name: str, **kwargs) -> Path:
    path = OUT / name
    if path.exists():
        path.unlink()
    doc.save(path, garbage=4, deflate=True, **kwargs)
    doc.close()
    return path


def plain_text() -> Path:
    doc = fitz.open()
    for index in range(3):
        page = doc.new_page(width=A4.width, height=A4.height)
        page.insert_text((72, 72), "PDF Studio Phase 11", fontsize=18)
        page.insert_text((72, 108), f"PLAIN_PAGE_{index + 1}_MARKER", fontsize=12)
        page.draw_rect(fitz.Rect(72, 140, 300, 220), color=(0, 0, 0), fill=(0.92, 0.92, 0.92))
        page.insert_text((84, 180), "Vector content and searchable text", fontsize=11)
        link_rect = fitz.Rect(72, 250, 260, 275)
        page.insert_text((72, 268), "https://example.invalid/local", fontsize=10, color=(0, 0, 1))
        page.insert_link({"kind": fitz.LINK_URI, "from": link_rect, "uri": "https://example.invalid/local"})
    doc.set_metadata({"title": "Phase 11 plain text", "author": "PDF Studio", "subject": "Deterministic validation fixture"})
    doc.set_toc([[1, "First page", 1], [1, "Second page", 2], [1, "Third page", 3]])
    return save(doc, "plain-text.pdf")


def mixed_pages() -> Path:
    doc = fitz.open()
    specs = [
        (A4.width, A4.height, 0, "A4_PORTRAIT"),
        (LETTER.width, LETTER.height, 90, "LETTER_ROTATED"),
        (A4.height, A4.width, 0, "A4_LANDSCAPE"),
        (420, 420, 180, "SQUARE_ROTATED")
    ]
    for width, height, rotation, marker in specs:
        page = doc.new_page(width=width, height=height)
        page.insert_text((36, 48), marker, fontsize=14)
        page.draw_line((20, 20), (width - 20, height - 20), color=(1, 0, 0), width=2)
        page.set_rotation(rotation)
    return save(doc, "mixed-pages.pdf")


def annotations() -> Path:
    doc = fitz.open()
    page = doc.new_page(width=A4.width, height=A4.height)
    text = "ANNOTATION_TARGET_TEXT"
    page.insert_text((72, 100), text, fontsize=14)
    rects = page.search_for(text)
    if rects:
        annot = page.add_highlight_annot(rects)
        annot.set_info(content="Highlight comment", title="Phase 11")
        annot.update()
    note = page.add_text_annot((72, 150), "Sticky note fixture")
    note.set_info(title="Phase 11", subject="Review")
    note.update()
    square = page.add_rect_annot(fitz.Rect(72, 200, 240, 280))
    square.set_colors(stroke=(1, 0, 0), fill=(1, 1, 0))
    square.set_opacity(0.35)
    square.update()
    page.add_ink_annot([[(72, 330), (110, 350), (150, 325), (210, 360)]]).update()
    return save(doc, "annotations.pdf")


def forms() -> Path:
    doc = fitz.open()
    page = doc.new_page(width=A4.width, height=A4.height)
    page.insert_text((72, 60), "FORM_FIXTURE", fontsize=16)

    text = fitz.Widget()
    text.field_name = "full_name"
    text.field_type = fitz.PDF_WIDGET_TYPE_TEXT
    text.rect = fitz.Rect(72, 100, 320, 130)
    text.field_value = "Ada Lovelace"
    page.add_widget(text)

    checkbox = fitz.Widget()
    checkbox.field_name = "accepted"
    checkbox.field_type = fitz.PDF_WIDGET_TYPE_CHECKBOX
    checkbox.rect = fitz.Rect(72, 160, 92, 180)
    checkbox.field_value = "Yes"
    page.add_widget(checkbox)

    combo = fitz.Widget()
    combo.field_name = "country"
    combo.field_type = fitz.PDF_WIDGET_TYPE_COMBOBOX
    combo.rect = fitz.Rect(72, 210, 240, 240)
    combo.choice_values = ["Germany", "Korea", "France"]
    combo.field_value = "Germany"
    page.add_widget(combo)
    return save(doc, "forms.pdf")


def unicode_fixture() -> Path:
    doc = fitz.open()
    page = doc.new_page(width=A4.width, height=A4.height)
    arabic = "/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf"
    page.insert_font(fontname="NotoArabic", fontfile=arabic)
    page.insert_text((72, 80), "English: searchable Unicode fixture", fontsize=12)
    page.insert_text((72, 125), "한국어 PDF 편집 테스트", fontname="korea", fontsize=14)
    page.insert_text((72, 170), "中文 PDF 编辑测试", fontname="china-s", fontsize=14)
    page.insert_text((72, 215), "日本語 PDF 編集テスト", fontname="japan", fontsize=14)
    page.insert_text((72, 265), "اختبار تحرير ملف PDF", fontname="NotoArabic", fontsize=16)
    return save(doc, "unicode.pdf")


def redaction_pair() -> tuple[Path, Path]:
    source = fitz.open()
    page = source.new_page(width=A4.width, height=A4.height)
    page.insert_text((72, 90), "PUBLIC_TEXT", fontsize=14)
    page.insert_text((72, 140), "SECRET_ALPHA_491", fontsize=14)
    page.insert_text((72, 190), "SECRET_BETA_827", fontsize=14)
    source.set_metadata({"title": "SECRET_METADATA_GAMMA_163", "author": "Phase 11"})
    source_path = save(source, "redaction-source.pdf")

    doc = fitz.open(source_path)
    page = doc[0]
    for term in ["SECRET_ALPHA_491", "SECRET_BETA_827"]:
        for rect in page.search_for(term):
            page.add_redact_annot(rect, fill=(0, 0, 0))
    page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_PIXELS)
    metadata = doc.metadata
    metadata["title"] = "Redacted fixture"
    doc.set_metadata(metadata)
    redacted_path = save(doc, "redaction-applied.pdf")
    return source_path, redacted_path


def encrypted() -> Path:
    doc = fitz.open()
    page = doc.new_page(width=A4.width, height=A4.height)
    page.insert_text((72, 100), "ENCRYPTED_FIXTURE", fontsize=16)
    path = OUT / "encrypted-aes256.pdf"
    if path.exists():
        path.unlink()
    doc.save(
        path,
        encryption=fitz.PDF_ENCRYPT_AES_256,
        owner_pw="phase11-owner",
        user_pw="phase11-user",
        permissions=fitz.PDF_PERM_PRINT | fitz.PDF_PERM_COPY,
        garbage=4,
        deflate=True,
    )
    doc.close()
    return path


def large_document() -> Path:
    doc = fitz.open()
    for index in range(200):
        page = doc.new_page(width=A4.width, height=A4.height)
        page.insert_text((48, 60), f"LARGE_DOCUMENT_PAGE_{index + 1:04d}", fontsize=11)
        for line in range(15):
            page.insert_text((48, 90 + line * 22), f"Page {index + 1} line {line + 1}: deterministic performance text.", fontsize=9)
    return save(doc, "large-200-pages.pdf")


def malformed(source: Path) -> Path:
    data = source.read_bytes()
    path = OUT / "malformed-truncated.pdf"
    path.write_bytes(data[: max(200, len(data) // 2)])
    return path


def incremental() -> Path:
    path = OUT / "incremental-history.pdf"
    if path.exists():
        path.unlink()
    doc = fitz.open()
    page = doc.new_page(width=A4.width, height=A4.height)
    page.insert_text((72, 100), "INCREMENTAL_REVISION_ONE", fontsize=12)
    doc.save(path)
    doc.close()
    doc = fitz.open(path)
    doc[0].insert_text((72, 150), "INCREMENTAL_REVISION_TWO", fontsize=12)
    doc.saveIncr()
    doc.close()
    return path


def main() -> None:
    for path in OUT.glob("*"):
        if path.is_file():
            path.unlink()
    files = [plain_text(), mixed_pages(), annotations(), forms(), unicode_fixture()]
    files.extend(redaction_pair())
    files.extend([encrypted(), large_document(), incremental()])
    files.append(malformed(files[0]))

    expectations = {
        "plain-text.pdf": {"pages": 3, "text": ["PLAIN_PAGE_1_MARKER", "PLAIN_PAGE_3_MARKER"], "bookmarks": 3, "links_min": 3},
        "mixed-pages.pdf": {"pages": 4, "text": ["A4_PORTRAIT", "SQUARE_ROTATED"]},
        "annotations.pdf": {"pages": 1, "text": ["ANNOTATION_TARGET_TEXT"], "annotations_min": 4},
        "forms.pdf": {"pages": 1, "text": ["FORM_FIXTURE"], "form_fields_min": 3},
        "unicode.pdf": {"pages": 1, "text": ["English: searchable Unicode fixture"]},
        "redaction-source.pdf": {"pages": 1, "text": ["SECRET_ALPHA_491", "SECRET_BETA_827"], "metadata_contains": "SECRET_METADATA_GAMMA_163"},
        "redaction-applied.pdf": {"pages": 1, "text": ["PUBLIC_TEXT"], "text_absent": ["SECRET_ALPHA_491", "SECRET_BETA_827"], "metadata_absent": "SECRET_METADATA_GAMMA_163"},
        "encrypted-aes256.pdf": {"pages": 1, "encrypted": True, "password": "phase11-user", "text": ["ENCRYPTED_FIXTURE"]},
        "large-200-pages.pdf": {"pages": 200, "text": ["LARGE_DOCUMENT_PAGE_0001", "LARGE_DOCUMENT_PAGE_0200"]},
        "incremental-history.pdf": {"pages": 1, "text": ["INCREMENTAL_REVISION_ONE", "INCREMENTAL_REVISION_TWO"], "incremental": True},
        "malformed-truncated.pdf": {"malformed": True},
    }
    manifest = {
        "schemaVersion": 1,
        "generatedBy": "PDF Studio Phase 11",
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
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(OUT), "files": len(files)}, indent=2))


if __name__ == "__main__":
    main()
