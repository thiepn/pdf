#!/usr/bin/env python3
"""F11 fail-closed independent structural and raster qualification of real browser outputs."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

import fitz
from PIL import Image
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "f9"))
import validate_export_roundtrip as f9
sys.path.insert(0, str(ROOT / "scripts" / "f10"))
import validate_extended_exports as f10

PROJECTS = ("chromium", "firefox", "webkit")
F11_CASES = ("rotated-crop", "nonzero-origin")


def render_profile(document: Path, output_base: Path) -> dict[str, Any]:
    """Check real output raster with independent Poppler and MuPDF, without golden updates."""
    output_base.parent.mkdir(parents=True, exist_ok=True)
    poppler_base = output_base.with_name(output_base.name + "-poppler")
    f9.run("pdftoppm", "-f", "1", "-l", "1", "-singlefile", "-scale-to", "640",
           "-png", str(document), str(poppler_base))
    poppler_png = poppler_base.with_suffix(".png")
    if not poppler_png.exists():
        raise ValueError("Poppler produced no first page")
    with fitz.open(document) as parsed:
        if parsed.page_count < 1 or parsed.is_encrypted:
            raise ValueError("MuPDF could not open an unencrypted PDF")
        page = parsed[0]
        bound = page.rect
        if min(bound.width, bound.height) <= 0:
            raise ValueError("Nonpositive raster dimensions")
        pixmap = page.get_pixmap(matrix=fitz.Matrix(640.0 / max(bound.width, bound.height),
                                                    640.0 / max(bound.width, bound.height)), alpha=False)
        mupdf_png = output_base.with_name(output_base.name + "-mupdf.png")
        pixmap.save(str(mupdf_png))
    rendered: dict[str, dict[str, Any]] = {}
    for engine, png in (("poppler", poppler_png), ("mupdf", mupdf_png)):
        with Image.open(png) as image:
            image.verify()
        with Image.open(png) as image:
            grey = image.convert("L")
            count = sum(pixel < 235 for pixel in grey.getdata())
            ink = count / (image.width * image.height)
            if ink < 0.0003:
                raise ValueError(engine + " rendered near-blank output")
            rendered[engine] = {"sha256": hashlib.sha256(png.read_bytes()).hexdigest(),
                                "width": image.width, "height": image.height,
                                "inkFraction": round(ink, 6)}
    left, right = rendered["poppler"], rendered["mupdf"]
    if abs(left["width"] - right["width"]) > 3 or abs(left["height"] - right["height"]) > 3:
        raise ValueError("Independent raster extents disagree")
    if abs(left["inkFraction"] - right["inkFraction"]) > 0.08:
        raise ValueError("Independent raster occupancy differs beyond tolerance")
    return rendered


def verify_origin(name: str, source: Path, output: Path) -> list[str]:
    original = PdfReader(str(source), strict=True).pages[0]
    exported = PdfReader(str(output), strict=True).pages[0]
    problems = []
    if name == "rotated-crop":
        if int(original.get("/Rotate", 0)) % 360 == 0:
            problems.append("Rotation precondition absent")
        if list(original.cropbox) == list(original.mediabox):
            problems.append("Crop inset precondition absent")
    elif name == "nonzero-origin":
        if float(original.mediabox.left) == 0 and float(original.mediabox.bottom) == 0:
            problems.append("Nonzero-origin precondition absent")
    if f9.geometry(original) != f9.geometry(exported):
        problems.append("Export changed MediaBox, CropBox or Rotate")
    return problems


def authored_rectangle(file: Path) -> dict[str, float]:
    page = PdfReader(str(file), strict=True).pages[0]
    authored = [ref.get_object() for ref in page.get("/Annots", [])
                if str(ref.get_object().get("/Subtype")) == "/Square"
                and str(ref.get_object().get("/T")) == "PDF Studio"]
    if len(authored) != 1:
        raise ValueError("Exactly one authored Square is required")
    rectangle = authored[0]
    normal = (rectangle.get("/AP") or {}).get("/N")
    if normal is None or not hasattr(normal.get_object(), "get_data") or not normal.get_object().get_data():
        raise ValueError("Rectangle has no genuine appearance stream")
    x0, y0, x1, y1 = [float(v) for v in rectangle["/Rect"]]
    crop = page.cropbox
    left, bottom = float(crop.left), float(crop.bottom)
    width, height = float(crop.width), float(crop.height)
    if width <= 0 or height <= 0 or x1 <= x0 or y1 <= y0:
        raise ValueError("Invalid authored geometry")
    return {"centerX": round(((x0 + x1) / 2 - left) / width, 5),
            "centerY": round(((y0 + y1) / 2 - bottom) / height, 5),
            "width": round((x1 - x0) / width, 5),
            "height": round((y1 - y0) / height, 5)}


def compare_browser_geometry(results: list[dict[str, Any]]) -> list[str]:
    issues = []
    for fixture in (*sorted(f10.ANNOTATION_EDIT_CASES), *F11_CASES):
        positions = []
        for result in results:
            case = next((entry for entry in result["cases"] if entry["case"] == fixture), None)
            if case is None or not case["passed"] or "newRectangle" not in case:
                issues.append("Missing geometry for " + result["browser"] + "/" + fixture)
            else:
                positions.append(case["newRectangle"])
        if len(positions) != len(PROJECTS):
            continue
        for component in ("centerX", "centerY", "width", "height"):
            values = [value[component] for value in positions]
            if max(values) - min(values) > 0.12:
                issues.append("Browser rectangle geometry drift: " + fixture + "/" + component)
    return issues


def validate_project(project: str, f10_root: Path, f11_root: Path, raster_root: Path) -> dict[str, Any]:
    if project not in PROJECTS:
        raise ValueError("Unsupported browser project: " + project)
    cases = []
    for fixture in f10.CASES:
        entry = f10.validate_case(fixture, f10_root / project)
        output = f10_root / project / (fixture + ".pdf")
        if entry["passed"]:
            try:
                if fixture in f10.ANNOTATION_EDIT_CASES:
                    entry["newRectangle"] = authored_rectangle(output)
                entry["raster"] = render_profile(output, raster_root / project / fixture)
            except Exception as failure:
                entry["failures"].append("Independent raster failure: " + str(failure))
                entry["passed"] = False
        cases.append(entry)
    for fixture in F11_CASES:
        entry = f9.verify_case(fixture, f11_root / project)
        original = ROOT / "tests" / "corpus" / "p8" / (fixture + ".pdf")
        output = f11_root / project / (fixture + "-edited.pdf")
        if entry["passed"]:
            try:
                entry["failures"].extend(verify_origin(fixture, original, output))
                entry["newRectangle"] = authored_rectangle(output)
                entry["raster"] = render_profile(output, raster_root / project / fixture)
                entry["passed"] = not entry["failures"]
            except Exception as failure:
                entry["failures"].append("Independent F11 failure: " + str(failure))
                entry["passed"] = False
        cases.append(entry)
    return {"browser": project, "passed": len(cases) == 7 and all(entry["passed"] for entry in cases),
            "cases": cases}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--f10-dir", type=Path, required=True)
    parser.add_argument("--f11-dir", type=Path, required=True)
    parser.add_argument("--raster-dir", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    results = [validate_project(browser, args.f10_dir, args.f11_dir, args.raster_dir) for browser in PROJECTS]
    issues = compare_browser_geometry(results)
    report = {"schemaVersion": 1,
              "qualified": len(results) == len(PROJECTS) and all(entry["passed"] for entry in results) and not issues,
              "crossBrowserGeometryIssues": issues,
              "origin": "Real Chromium, Firefox and WebKit browser-exported files",
              "externalReaders": ["qpdf", "pypdf", "Poppler", "MuPDF", "Pillow"],
              "renderScope": "Page extents and occupancy only; not pixel-golden or human visual approval",
              "results": results}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["qualified"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
