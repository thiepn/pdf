#!/usr/bin/env python3
"""F9: independently reopen actual browser-exported PDFs using qpdf and Poppler.

Only the explicitly approved test fixtures are accepted. Missing binaries/exports,
parser errors, and loss of source page semantics fail the gate rather than skip.
"""
from __future__ import annotations

import argparse
from collections import Counter
import json
import re
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
CASES = ("rotated-crop", "incremental")


def run(*argv: str) -> subprocess.CompletedProcess[bytes]:
    result = subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=45, check=False)
    if result.returncode:
        details = (result.stderr or result.stdout).decode("utf-8", "replace")[-1000:]
        raise ValueError(f"{Path(argv[0]).name} returned {result.returncode}: {details}")
    return result


def normalized(value: str) -> str:
    return " ".join(value.split())


def geometry(page: object) -> dict[str, object]:
    return {
        "media": [round(float(value), 3) for value in page.mediabox],
        "crop": [round(float(value), 3) for value in page.cropbox],
        "rotate": int(page.get("/Rotate", 0)) % 360,
    }


def annotation_records(page: object) -> list[dict[str, object]]:
    """Stable visible/semantic annotation properties, independent of object IDs.

    Rectangle drawing in PDF Studio creates a real /Square annotation, not page
    content. Compare inherited annotations and require precisely one *new* /Square.
    """
    def stable(value: object) -> object:
        if hasattr(value, "get_object"):
            value = value.get_object()
        if isinstance(value, dict):
            return {str(key): stable(item) for key, item in sorted(value.items())}
        if isinstance(value, (list, tuple)):
            return [stable(item) for item in value]
        if isinstance(value, (int, float)):
            return round(float(value), 4)
        if value is None:
            return None
        return str(value)

    records = []
    refs = page.get("/Annots")
    for reference in (refs.get_object() if refs is not None else []):
        obj = reference.get_object()
        appearance = obj.get("/AP")
        normal = appearance.get_object().get("/N") if appearance else None
        normal = normal.get_object() if normal is not None else None
        has_appearance = normal is not None and hasattr(normal, "get_data") and len(normal.get_data()) > 0
        fields = ("/Subtype", "/Rect", "/Contents", "/T", "/F", "/C", "/BS", "/Border", "/IC", "/RD")
        record = {key: stable(obj.get(key)) for key in fields}
        record["renderableAppearance"] = has_appearance
        records.append(record)
    return records


def compare_annotations(source: list[list[dict[str, object]]],
                        exported: list[list[dict[str, object]]]) -> list[str]:
    """Require preservation of old annotations plus exactly one rendered rectangle."""
    failures: list[str] = []
    if len(source) != len(exported):
        return ["Annotation page count changed."]
    for page_index, (original, result) in enumerate(zip(source, exported), 1):
        before = Counter(json.dumps(item, sort_keys=True) for item in original)
        after = Counter(json.dumps(item, sort_keys=True) for item in result)
        missing = before - after
        additions = after - before
        if missing:
            failures.append(f"Page {page_index}: original annotations were removed or altered.")
        if page_index == 1:
            if sum(additions.values()) != 1:
                failures.append(f"Page {page_index}: expected exactly one new rectangle annotation.")
            else:
                added = json.loads(next(iter(additions)))
                box = added.get("/Rect")
                valid_box = (isinstance(box, list) and len(box) == 4
                             and all(isinstance(n, (int, float)) for n in box)
                             and box[2] > box[0] and box[3] > box[1])
                if (added.get("/Subtype") != "/Square"
                        or added.get("/T") != "PDF Studio"
                        or not added.get("renderableAppearance")
                        or not valid_box):
                    failures.append(f"Page {page_index}: new /Square has invalid identity, appearance or bounds.")
        elif additions:
            failures.append(f"Page {page_index}: unexpected annotation was added.")
    return failures


def reader_profile(path: Path) -> dict[str, object]:
    reader = PdfReader(str(path), strict=True)
    if reader.is_encrypted:
        raise ValueError(f"Encrypted test artifact: {path.name}")
    return {
        "pages": len(reader.pages),
        "geometry": [geometry(page) for page in reader.pages],
        "annotations": [annotation_records(page) for page in reader.pages],
        "text": [normalized(page.extract_text() or "") for page in reader.pages],
    }


def poppler_profile(path: Path) -> dict[str, object]:
    info = run("pdfinfo", str(path)).stdout.decode("utf-8", "replace")
    match = re.search(r"^Pages:\s*(\d+)\s*$", info, re.MULTILINE)
    if match is None:
        raise ValueError(f"Poppler pdfinfo omitted the page count for {path.name}")
    text = run("pdftotext", "-enc", "UTF-8", str(path), "-").stdout.decode("utf-8", "replace")
    with TemporaryDirectory(prefix="f9-render-") as scratch:
        render = Path(scratch) / "page1"
        run("pdftoppm", "-f", "1", "-l", "1", "-scale-to", "640",
            "-png", "-singlefile", str(path), str(render))
        png = render.with_suffix(".png")
        if not png.is_file() or not png.read_bytes().startswith(b"\x89PNG\r\n\x1a\n"):
            raise ValueError(f"Poppler did not render a valid PNG for {path.name}")
    return {"pages": int(match.group(1)), "text": normalized(text)}


def verify_case(name: str, exports: Path) -> dict[str, object]:
    source = ROOT / "tests" / "corpus" / "p8" / f"{name}.pdf"
    target = exports / f"{name}-edited.pdf"
    failures: list[str] = []
    facts: dict[str, object] = {"case": name, "passed": False}
    for label, path in (("source", source), ("export", target)):
        if not path.is_file():
            failures.append(f"Missing {label} PDF: {path.name}")
        elif path.stat().st_size < 100 or not path.read_bytes()[:8].startswith(b"%PDF-"):
            failures.append(f"Invalid {label} PDF header or truncated document: {path.name}")
    if not failures:
        try:
            run("qpdf", "--check", str(target))
            source_reader = reader_profile(source)
            export_reader = reader_profile(target)
            source_poppler = poppler_profile(source)
            export_poppler = poppler_profile(target)
            facts["exportBytes"] = target.stat().st_size
            facts["pages"] = export_reader["pages"]
            for field in ("pages", "geometry", "text"):
                if source_reader[field] != export_reader[field]:
                    failures.append(f"pypdf changed {field} on a rectangle-only edit")
            failures.extend(compare_annotations(source_reader["annotations"], export_reader["annotations"]))
            if source_poppler["pages"] != export_poppler["pages"]:
                failures.append("Poppler page count changed after export")
            if source_poppler["text"] != export_poppler["text"]:
                failures.append("Poppler text extraction changed on a rectangle-only edit")
            if export_poppler["pages"] != export_reader["pages"]:
                failures.append("pypdf and Poppler disagree about export page count")
        except Exception as error:
            failures.append(f"External validation error: {type(error).__name__}: {error}")
    facts["failures"] = failures
    facts["passed"] = not failures
    return facts


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--export-dir", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    arguments = parser.parse_args()
    results = [verify_case(case, arguments.export_dir) for case in CASES]
    passed = all(result["passed"] for result in results)
    report = {"schemaVersion": 1, "passed": passed, "testMode": "browser exported PDFs",
              "validators": ["qpdf", "pypdf", "Poppler pdfinfo/pdftotext/pdftoppm"], "results": results}
    arguments.report.parent.mkdir(parents=True, exist_ok=True)
    arguments.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
