#!/usr/bin/env python3
"""F10: certify actual browser outputs with qpdf, pypdf and independent Poppler."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "f9"))
import validate_export_roundtrip as independent  # noqa: E402

CASES = ("forms", "comments-measurements", "optimization", "batch-alpha", "batch-beta")
ANNOTATION_EDIT_CASES = frozenset(("forms", "comments-measurements"))


def object_value(value: Any) -> Any:
    if hasattr(value, "get_object"):
        value = value.get_object()
    if isinstance(value, dict):
        return {str(k): object_value(v) for k, v in sorted(value.items())}
    if isinstance(value, (list, tuple)):
        return [object_value(v) for v in value]
    if isinstance(value, (int, float)):
        return round(float(value), 6)
    if value is None:
        return None
    return str(value)


def form_profile(pdf: Path) -> dict[str, Any]:
    fields = PdfReader(str(pdf), strict=True).get_fields() or {}
    return {name: object_value({key: field.get(key) for key in ("/FT", "/V", "/Ff", "/TU")})
            for name, field in sorted(fields.items())}


def measurement_profile(pdf: Path) -> list[Any]:
    reader = PdfReader(str(pdf), strict=True)
    found = []
    for number, page in enumerate(reader.pages):
        for ref in page.get("/Annots", []):
            annotation = ref.get_object()
            if annotation.get("/Measure"):
                found.append({"page": number + 1, "subtype": str(annotation.get("/Subtype")),
                              "measure": object_value(annotation["/Measure"])})
    return found


def validate_case(name: str, exports: Path) -> dict[str, Any]:
    if name not in CASES:
        raise ValueError(f"Unapproved corpus case: {name}")
    source = ROOT / "tests" / "corpus" / "f10" / f"{name}.pdf"
    target = exports / f"{name}.pdf"
    failures: list[str] = []
    facts: dict[str, Any] = {"case": name, "passed": False, "failures": failures}
    for label, path in (("source", source), ("output", target)):
        if not path.is_file() or path.stat().st_size < 100 or not path.read_bytes().startswith(b"%PDF-"):
            failures.append(f"Missing, invalid or truncated {label}: {path.name}")
    if failures:
        return facts
    try:
        independent.run("qpdf", "--check", str(source))
        independent.run("qpdf", "--check", str(target))
        original = independent.reader_profile(source)
        exported = independent.reader_profile(target)
        old_poppler = independent.poppler_profile(source)
        new_poppler = independent.poppler_profile(target)
        for property_name in ("pages", "geometry", "text"):
            if original[property_name] != exported[property_name]:
                failures.append(f"pypdf changed {property_name}")
        if old_poppler != new_poppler:
            failures.append("Poppler page/text profile changed")
        if new_poppler["pages"] != exported["pages"]:
            failures.append("Independent readers disagree about exported page count")
        if name in ANNOTATION_EDIT_CASES:
            failures.extend(independent.compare_annotations(original["annotations"], exported["annotations"]))
        elif original["annotations"] != exported["annotations"]:
            failures.append("Optimization or batch export changed source annotations")
        if name == "forms":
            initial_fields = form_profile(source)
            if not initial_fields:
                failures.append("Form source has no real AcroForm field")
            if initial_fields != form_profile(target):
                failures.append("AcroForm field identity/type/value/label was lost or modified")
        if name == "comments-measurements":
            source_measurements = measurement_profile(source)
            if not source_measurements:
                failures.append("Source has no genuine /Measure annotations")
            if source_measurements != measurement_profile(target):
                failures.append("Exported /Measure geometry/units/scale changed")
        facts["pages"] = exported["pages"]
        facts["outputBytes"] = target.stat().st_size
    except Exception as error:
        failures.append(f"Independent reader error: {type(error).__name__}: {error}")
    facts["passed"] = not failures
    return facts


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--export-dir", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    cases = [validate_case(case, args.export_dir) for case in CASES]
    report = {"schemaVersion": 1, "passed": all(c["passed"] for c in cases),
              "origin": "Real browser exported PDFs",
              "independentReaders": ["qpdf", "pypdf", "Poppler"], "cases": cases}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
