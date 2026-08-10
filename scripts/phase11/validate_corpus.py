#!/usr/bin/env python3
"""Validate the Phase 11 corpus with two independent Python PDF readers."""
from __future__ import annotations

import hashlib
import json
import logging
import time
from pathlib import Path
from typing import Any

import fitz
from pypdf import PdfReader

logging.getLogger("pypdf").setLevel(logging.ERROR)

ROOT = Path(__file__).resolve().parents[2]
CORPUS = ROOT / "tests" / "corpus" / "generated"
REPORT = ROOT / "docs" / "phase-11" / "corpus-validation-report.json"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def flatten_outline(items: list[Any]) -> int:
    count = 0
    for item in items:
        if isinstance(item, list):
            count += flatten_outline(item)
        else:
            count += 1
    return count


def fitz_result(path: Path, expect: dict[str, Any]) -> dict[str, Any]:
    started = time.perf_counter()
    result: dict[str, Any] = {"engine": "PyMuPDF", "passed": True, "checks": []}
    try:
        doc = fitz.open(path)
        was_encrypted = bool(doc.needs_pass or doc.is_encrypted)
        if doc.needs_pass:
            password = expect.get("password", "")
            authenticated = bool(doc.authenticate(password))
            result["checks"].append({"name": "authenticate", "passed": authenticated})
            if not authenticated:
                result["passed"] = False
                return result
        text = "\n".join(page.get_text() for page in doc)
        page_count = doc.page_count
        result["pageCount"] = page_count
        result["textLength"] = len(text)
        result["annotations"] = sum(1 for page in doc for _ in (page.annots() or []))
        result["links"] = sum(len(page.get_links()) for page in doc)
        result["formFields"] = sum(1 for page in doc for _ in (page.widgets() or []))
        result["bookmarks"] = len(doc.get_toc())
        result["encrypted"] = was_encrypted
        result["metadata"] = doc.metadata
        doc.close()

        def check(name: str, condition: bool, detail: Any = None) -> None:
            result["checks"].append({"name": name, "passed": bool(condition), "detail": detail})
            if not condition:
                result["passed"] = False

        if "pages" in expect:
            check("page-count", page_count == expect["pages"], page_count)
        for marker in expect.get("text", []):
            check(f"text:{marker}", marker in text)
        for marker in expect.get("text_absent", []):
            check(f"text-absent:{marker}", marker not in text)
        if "annotations_min" in expect:
            check("annotations", result["annotations"] >= expect["annotations_min"], result["annotations"])
        if "links_min" in expect:
            check("links", result["links"] >= expect["links_min"], result["links"])
        if "form_fields_min" in expect:
            check("form-fields", result["formFields"] >= expect["form_fields_min"], result["formFields"])
        if "bookmarks" in expect:
            check("bookmarks", result["bookmarks"] == expect["bookmarks"], result["bookmarks"])
        if "metadata_contains" in expect:
            check("metadata-contains", expect["metadata_contains"] in json.dumps(result["metadata"]))
        if "metadata_absent" in expect:
            check("metadata-absent", expect["metadata_absent"] not in json.dumps(result["metadata"]))
        if expect.get("encrypted"):
            check("encrypted", result["encrypted"])
    except Exception as exc:
        if expect.get("malformed"):
            result["checks"].append({"name": "malformed-rejected", "passed": True, "detail": str(exc)})
        else:
            result["passed"] = False
            result["error"] = str(exc)
    result["durationMs"] = round((time.perf_counter() - started) * 1000, 2)
    return result


def pypdf_result(path: Path, expect: dict[str, Any]) -> dict[str, Any]:
    started = time.perf_counter()
    result: dict[str, Any] = {"engine": "pypdf", "passed": True, "checks": []}
    try:
        reader = PdfReader(str(path), strict=False)
        if reader.is_encrypted:
            password = expect.get("password", "")
            authenticated = bool(reader.decrypt(password))
            result["checks"].append({"name": "authenticate", "passed": authenticated})
            if not authenticated:
                result["passed"] = False
                return result
        page_count = len(reader.pages)
        text = "\n".join((page.extract_text() or "") for page in reader.pages)
        result["pageCount"] = page_count
        result["textLength"] = len(text)
        result["encrypted"] = bool(reader.is_encrypted)
        try:
            result["bookmarks"] = flatten_outline(reader.outline)
        except Exception:
            result["bookmarks"] = 0
        form_fields = reader.get_fields() or {}
        result["formFields"] = len(form_fields)

        def check(name: str, condition: bool, detail: Any = None) -> None:
            result["checks"].append({"name": name, "passed": bool(condition), "detail": detail})
            if not condition:
                result["passed"] = False

        if "pages" in expect:
            check("page-count", page_count == expect["pages"], page_count)
        for marker in expect.get("text", []):
            check(f"text:{marker}", marker in text)
        for marker in expect.get("text_absent", []):
            check(f"text-absent:{marker}", marker not in text)
        if "form_fields_min" in expect:
            check("form-fields", result["formFields"] >= expect["form_fields_min"], result["formFields"])
        if "bookmarks" in expect:
            check("bookmarks", result["bookmarks"] >= expect["bookmarks"], result["bookmarks"])
    except Exception as exc:
        if expect.get("malformed"):
            result["checks"].append({"name": "malformed-rejected", "passed": True, "detail": str(exc)})
        else:
            result["passed"] = False
            result["error"] = str(exc)
    result["durationMs"] = round((time.perf_counter() - started) * 1000, 2)
    return result


def main() -> None:
    manifest = json.loads((CORPUS / "manifest.json").read_text(encoding="utf-8"))
    rows = []
    passed = True
    for entry in manifest["files"]:
        path = CORPUS / entry["filename"]
        checksum_ok = path.exists() and sha256(path) == entry["sha256"]
        engine_results = [fitz_result(path, entry["expect"]), pypdf_result(path, entry["expect"])]
        row_passed = checksum_ok and all(item["passed"] for item in engine_results)
        passed = passed and row_passed
        rows.append({"filename": entry["filename"], "checksum": checksum_ok, "passed": row_passed, "engines": engine_results})
    report = {
        "schemaVersion": 1,
        "passed": passed,
        "corpusFiles": len(rows),
        "engines": {"PyMuPDF": fitz.__doc__.splitlines()[0] if fitz.__doc__ else "PyMuPDF", "pypdf": "5.9.0"},
        "results": rows,
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"passed": passed, "files": len(rows), "report": str(REPORT)}, indent=2))
    if not passed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
