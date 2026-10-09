#!/usr/bin/env python3
"""Generate deterministic, non-private PDFs with interactive and measurement objects."""
from __future__ import annotations

import json
from pathlib import Path

import fitz
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, DictionaryObject, NameObject, NumberObject, TextStringObject

OUT = Path(__file__).resolve().parents[2] / "tests" / "corpus" / "f10"


def write_text(name: str, marker: str, pages: int = 1) -> None:
    document = fitz.open()
    for page_index in range(1, pages + 1):
        page = document.new_page(width=595, height=842)
        page.insert_text((65, 75), f"{marker} page {page_index}", fontsize=14)
    document.save(OUT / name, deflate=True)
    document.close()


def form_fixture() -> None:
    document = fitz.open()
    page = document.new_page(width=595, height=842)
    page.insert_text((65, 90), "F10 Form export preservation", fontsize=13)
    field = fitz.Widget()
    field.field_name = "contact.email"
    field.field_label = "Contact email"
    field.field_value = "ada@example.test"
    field.field_type = fitz.PDF_WIDGET_TYPE_TEXT
    field.rect = fitz.Rect(60, 115, 310, 145)
    page.add_widget(field)
    document.save(OUT / "forms.pdf", deflate=True)
    document.close()


def comments_measurement() -> None:
    path = OUT / "comments-measurements.pdf"
    document = fitz.open()
    page = document.new_page(width=595, height=842)
    page.insert_text((65, 85), "F10 Comments and measured distance", fontsize=13)
    page.add_text_annot(fitz.Point(85, 130), "Reviewer note: check 25 mm distance")
    line = page.add_line_annot(fitz.Point(100, 220), fitz.Point(220, 220))
    line.set_info(title="Distance", content="120 mm")
    line.update()
    document.save(path, deflate=True)
    document.close()

    writer = PdfWriter(clone_from=str(path))
    annotations = writer.pages[0].get("/Annots").get_object()
    lines = [ref.get_object() for ref in annotations if ref.get_object().get("/Subtype") == "/Line"]
    if len(lines) != 1:
        raise ValueError("Expected one line annotation")
    lines[0][NameObject("/Measure")] = DictionaryObject({
        NameObject("/Type"): NameObject("/Measure"),
        NameObject("/Subtype"): NameObject("/RL"),
        NameObject("/R"): TextStringObject("1 mm = 1 mm"),
        NameObject("/D"): ArrayObject([DictionaryObject({
            NameObject("/Type"): NameObject("/NumberFormat"),
            NameObject("/U"): TextStringObject("mm"),
            NameObject("/C"): NumberObject(1),
        })]),
    })
    with path.open("wb") as output:
        writer.write(output)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    form_fixture()
    comments_measurement()
    write_text("optimization.pdf", "F10 Optimization text", pages=2)
    write_text("batch-alpha.pdf", "F10 Batch alpha")
    write_text("batch-beta.pdf", "F10 Batch beta")
    expected = {"forms.pdf": 1, "comments-measurements.pdf": 1, "optimization.pdf": 2,
                "batch-alpha.pdf": 1, "batch-beta.pdf": 1}
    for filename, count in expected.items():
        reader = PdfReader(str(OUT / filename), strict=True)
        if len(reader.pages) != count or not reader.pages[0].extract_text():
            raise ValueError(f"Invalid source: {filename}")
    form = PdfReader(str(OUT / "forms.pdf"), strict=True)
    if not form.get_fields() or "contact.email" not in form.get_fields():
        raise ValueError("Missing interactive AcroForm source")
    measure = PdfReader(str(OUT / "comments-measurements.pdf"), strict=True)
    annots = [ref.get_object() for ref in measure.pages[0]["/Annots"]]
    if sorted(str(a["/Subtype"]) for a in annots if a["/Subtype"] != "/Popup") != ["/Line", "/Text"]:
        raise ValueError("Missing comment or measured line")
    if str(next(a["/Measure"]["/Subtype"] for a in annots if a["/Subtype"] == "/Line")) != "/RL":
        raise ValueError("Measurement dictionary missing")
    (OUT / "manifest.json").write_text(json.dumps({"schemaVersion": 1, "expected": expected}, indent=2) + "\n")
    print(f"F10 synthetic corpus generated and verified: {len(expected)} PDFs")


if __name__ == "__main__":
    main()
