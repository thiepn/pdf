from __future__ import annotations

import json
import shutil
from pathlib import Path

import fitz
from pypdf import PdfReader, PdfWriter

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "tests" / "corpus" / "p8"
PASSWORD = "p8-user"


def reset() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True, exist_ok=True)


def basic_pdf(path: Path, title: str = "P8 compatibility fixture") -> None:
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)
    page.insert_text((72, 96), title, fontsize=18)
    page.insert_text((72, 130), "Searchable text must survive compatibility handling.", fontsize=11)
    page.draw_rect(fitz.Rect(70, 160, 260, 230), color=(0.1, 0.25, 0.7), fill=(0.92, 0.95, 1), width=2)
    doc.set_metadata({"title": title, "author": "PDF Studio P8", "subject": "Fidelity certification"})
    doc.save(path, garbage=4, deflate=True)
    doc.close()


def rotated_crop(path: Path) -> None:
    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)
    page.cropbox.lower_left = (40, 60)
    page.cropbox.upper_right = (500, 700)
    page.rotate(90)
    writer.add_metadata({"/Title": "P8 rotated crop", "/Author": "PDF Studio P8"})
    with path.open("wb") as handle:
        writer.write(handle)


def encrypted(path: Path) -> None:
    source = OUT / "_encrypted_source.pdf"
    basic_pdf(source, "P8 encrypted source")
    reader = PdfReader(str(source))
    writer = PdfWriter()
    writer.append_pages_from_reader(reader)
    writer.add_metadata({"/Title": "P8 AES-256 encrypted", "/Author": "PDF Studio P8"})
    writer.encrypt(user_password=PASSWORD, owner_password="p8-owner", algorithm="AES-256")
    with path.open("wb") as handle:
        writer.write(handle)
    source.unlink()


def object_streams(path: Path) -> None:
    doc = fitz.open()
    for index in range(3):
        page = doc.new_page(width=595.276, height=841.89)
        page.insert_text((64, 90), f"Object stream page {index + 1}", fontsize=14)
        for row in range(8):
            page.draw_rect(fitz.Rect(60 + row * 12, 130 + row * 20, 320 + row * 6, 142 + row * 20), color=(0.2, 0.2, 0.2), width=0.6)
    doc.save(path, garbage=4, deflate=True, use_objstms=1)
    doc.close()


def nested_forms(path: Path) -> None:
    source = fitz.open()
    source_page = source.new_page(width=220, height=120)
    source_page.draw_rect(fitz.Rect(4, 4, 216, 116), color=(0.5, 0.25, 0.05), fill=(0.98, 0.94, 0.82), width=1.5)
    source_page.insert_text((18, 55), "Reusable Form XObject", fontsize=13)
    target = fitz.open()
    page = target.new_page(width=612, height=792)
    page.show_pdf_page(fitz.Rect(70, 100, 290, 220), source, 0)
    page.show_pdf_page(fitz.Rect(320, 300, 485, 390), source, 0)
    target.save(path, garbage=4, deflate=True)
    target.close()
    source.close()


def transparency(path: Path) -> None:
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)
    page.draw_rect(fitz.Rect(80, 100, 330, 270), color=(0.05, 0.2, 0.65), fill=(0.1, 0.55, 0.95), width=5, stroke_opacity=0.65, fill_opacity=0.35)
    page.draw_circle(fitz.Point(260, 220), 90, color=(0.7, 0.1, 0.2), fill=(0.95, 0.25, 0.3), fill_opacity=0.45)
    page.insert_text((90, 330), "Transparency / ExtGState fixture", fontsize=14)
    doc.save(path, garbage=4, deflate=True)
    doc.close()


def incremental(path: Path) -> None:
    basic_pdf(path, "P8 incremental revision")
    doc = fitz.open(path)
    metadata = doc.metadata
    metadata["subject"] = "Second incremental revision"
    doc.set_metadata(metadata)
    doc.saveIncr()
    doc.close()


def annotations(path: Path) -> None:
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)
    page.insert_text((72, 90), "Annotations, links and widgets must not disappear.", fontsize=12)
    page.add_text_annot(fitz.Point(120, 150), "P8 annotation")
    page.insert_link({"kind": fitz.LINK_URI, "from": fitz.Rect(72, 190, 240, 215), "uri": "https://example.com/p8"})
    doc.save(path, garbage=4, deflate=True)
    doc.close()


def nonzero_media_origin(path: Path) -> None:
    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)
    page.mediabox.lower_left = (20, 30)
    page.mediabox.upper_right = (632, 822)
    page.cropbox.lower_left = (45, 55)
    page.cropbox.upper_right = (560, 760)
    writer.add_metadata({"/Title": "P8 nonzero page origin"})
    with path.open("wb") as handle:
        writer.write(handle)


def main() -> None:
    reset()
    fixtures = [
        {"name": "classic.pdf", "kind": "classic", "pages": 1},
        {"name": "rotated-crop.pdf", "kind": "rotated-crop", "pages": 1, "rotation": 90},
        {"name": "encrypted-aes256.pdf", "kind": "encrypted", "pages": 1, "password": PASSWORD},
        {"name": "object-streams.pdf", "kind": "object-streams", "pages": 3},
        {"name": "nested-forms.pdf", "kind": "nested-forms", "pages": 1},
        {"name": "transparency.pdf", "kind": "transparency", "pages": 1},
        {"name": "incremental.pdf", "kind": "incremental", "pages": 1},
        {"name": "annotations-links.pdf", "kind": "annotations", "pages": 1},
        {"name": "nonzero-origin.pdf", "kind": "nonzero-origin", "pages": 1},
    ]

    basic_pdf(OUT / "classic.pdf")
    rotated_crop(OUT / "rotated-crop.pdf")
    encrypted(OUT / "encrypted-aes256.pdf")
    object_streams(OUT / "object-streams.pdf")
    nested_forms(OUT / "nested-forms.pdf")
    transparency(OUT / "transparency.pdf")
    incremental(OUT / "incremental.pdf")
    annotations(OUT / "annotations-links.pdf")
    nonzero_media_origin(OUT / "nonzero-origin.pdf")

    manifest = {"version": 1, "fixtures": fixtures}
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(OUT), "files": len(fixtures)}, indent=2))


if __name__ == "__main__":
    main()
