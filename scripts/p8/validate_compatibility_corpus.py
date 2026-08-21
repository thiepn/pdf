from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import fitz
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
CORPUS = ROOT / "tests" / "corpus" / "p8"
REPORT = ROOT / "docs" / "p8" / "compatibility-corpus-report.json"


def resolved(value: Any) -> Any:
    return value.get_object() if hasattr(value, "get_object") else value


def form_xobject_count(reader: PdfReader) -> int:
    count = 0
    for page in reader.pages:
        resources = resolved(page.get("/Resources")) or {}
        xobjects = resolved(resources.get("/XObject")) or {}
        for value in xobjects.values():
            obj = resolved(value)
            if str(obj.get("/Subtype", "")) == "/Form":
                count += 1
    return count


def annotation_inventory(reader: PdfReader) -> dict[str, int]:
    result = {"annotations": 0, "links": 0, "widgets": 0}
    for page in reader.pages:
        annotations = resolved(page.get("/Annots")) or []
        for reference in annotations:
            annotation = resolved(reference)
            subtype = str(annotation.get("/Subtype", ""))
            if subtype == "/Link":
                result["links"] += 1
            elif subtype == "/Widget":
                result["widgets"] += 1
            else:
                result["annotations"] += 1
    return result


def validate_fixture(entry: dict[str, Any]) -> dict[str, Any]:
    path = CORPUS / entry["name"]
    failures: list[str] = []
    password = entry.get("password")
    raw = path.read_bytes()

    reader = PdfReader(str(path))
    if reader.is_encrypted:
        if not password or not reader.decrypt(password):
            failures.append("pypdf could not authenticate encrypted fixture")
    if len(reader.pages) != entry["pages"]:
        failures.append(f"pypdf page count {len(reader.pages)} != {entry['pages']}")

    document = fitz.open(path)
    try:
        if document.needs_pass:
            if not password or document.authenticate(password) == 0:
                failures.append("PyMuPDF could not authenticate encrypted fixture")
        if document.page_count != entry["pages"]:
            failures.append(f"PyMuPDF page count {document.page_count} != {entry['pages']}")
        # Force independent page parsing/render-tree construction rather than
        # considering a document open sufficient compatibility evidence.
        for page_number in range(document.page_count):
            page = document.load_page(page_number)
            try:
                page.get_text("text")
                page.get_drawings()
                page.get_links()
            finally:
                page = None
    finally:
        document.close()

    kind = entry["kind"]
    if kind == "classic":
        text = " ".join((reader.pages[0].extract_text() or "").split())
        if "Searchable text" not in text:
            failures.append("classic searchable text missing in pypdf")
    elif kind == "rotated-crop":
        page = reader.pages[0]
        rotation = int(page.get("/Rotate", 0)) % 360
        crop = page.cropbox
        if rotation != 90:
            failures.append(f"rotation {rotation} != 90")
        if [float(crop.left), float(crop.bottom), float(crop.right), float(crop.top)] != [40.0, 60.0, 500.0, 700.0]:
            failures.append("crop box was not preserved by generator")
    elif kind == "encrypted":
        if not reader.is_encrypted or b"/Encrypt" not in raw:
            failures.append("AES-256 fixture is not encrypted")
    elif kind == "object-streams":
        if b"/ObjStm" not in raw:
            failures.append("object-stream fixture does not contain /ObjStm")
    elif kind == "nested-forms":
        if form_xobject_count(reader) < 1:
            failures.append("nested-form fixture exposes no Form XObject")
    elif kind == "transparency":
        if b"/ExtGState" not in raw or (b"/ca" not in raw and b"/CA" not in raw):
            failures.append("transparency fixture exposes no ExtGState alpha")
    elif kind == "incremental":
        if raw.count(b"startxref") < 2 or b"/Prev" not in raw:
            failures.append("incremental fixture does not contain multiple xref revisions")
    elif kind == "annotations":
        inventory = annotation_inventory(reader)
        if inventory["annotations"] < 1 or inventory["links"] < 1:
            failures.append(f"annotation inventory incomplete: {inventory}")
    elif kind == "nonzero-origin":
        page = reader.pages[0]
        media = page.mediabox
        crop = page.cropbox
        if [float(media.left), float(media.bottom)] != [20.0, 30.0]:
            failures.append("media box origin is not non-zero")
        if [float(crop.left), float(crop.bottom)] != [45.0, 55.0]:
            failures.append("crop box origin is not non-zero")

    return {
        "name": entry["name"],
        "kind": kind,
        "bytes": len(raw),
        "passed": not failures,
        "failures": failures,
    }


def main() -> None:
    manifest_path = CORPUS / "manifest.json"
    if not manifest_path.exists():
        raise SystemExit("P8 compatibility corpus is missing. Run generate_compatibility_corpus.py first.")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    results = [validate_fixture(entry) for entry in manifest["fixtures"]]
    failures = [result for result in results if not result["passed"]]
    report = {
        "passed": not failures,
        "files": len(results),
        "readers": {"PyMuPDF": fitz.VersionBind, "pypdf": __import__("pypdf").__version__},
        "results": results,
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"passed": report["passed"], "files": report["files"], "report": str(REPORT)}, indent=2))
    if failures:
        for failure in failures:
            print(f"FAIL {failure['name']}: {'; '.join(failure['failures'])}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
