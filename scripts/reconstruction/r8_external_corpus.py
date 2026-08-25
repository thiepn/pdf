#!/usr/bin/env python3
"""Build R8's reproducible external PDF corpus from a pinned pdf.js commit.

The downloaded PDFs are CI evidence only and are not committed. Provenance, hashes,
page counts, and reader-validation results are recorded in manifest.json.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import urllib.request
from pathlib import Path

import fitz  # PyMuPDF
from pypdf import PdfReader

UPSTREAM_REPO = "mozilla/pdf.js"
UPSTREAM_COMMIT = "a570239153c3af4508c3f06348dff35faa313737"
UPSTREAM_DIR = "test/pdfs"
TARGET_COUNT = 25
MIN_BYTES = 20_000
MAX_BYTES = 2_000_000
MAX_PAGES = 200
ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "tests" / "corpus" / "r8-external"
MANIFEST = OUTPUT / "manifest.json"


def request_json(url: str):
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "pdf-studio-r8-qualification",
            "Accept": "application/vnd.github+json",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def download(url: str, path: Path) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "pdf-studio-r8-qualification"})
    with urllib.request.urlopen(request, timeout=45) as response:
        data = response.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError("download exceeded R8 size ceiling")
    path.write_bytes(data)
    return data


def candidate_order(item: dict) -> str:
    # Hash ordering samples across the large upstream directory instead of taking
    # one alphabetical cluster, while remaining deterministic at the pinned SHA.
    return hashlib.sha256(item["name"].encode("utf-8")).hexdigest()


def validate_pdf(path: Path) -> tuple[int, str]:
    document = fitz.open(path)
    try:
        if document.needs_pass:
            raise ValueError("password-protected external fixture")
        page_count = document.page_count
        if page_count < 1 or page_count > MAX_PAGES:
            raise ValueError(f"page count outside R8 bounds: {page_count}")
        reader = PdfReader(str(path), strict=False)
        pypdf_pages = len(reader.pages)
        if pypdf_pages != page_count:
            raise ValueError(f"reader page-count disagreement: {page_count} vs {pypdf_pages}")
        document.load_page(0).rect
        return page_count, "PyMuPDF+pypdf"
    finally:
        document.close()


def main() -> None:
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir(parents=True, exist_ok=True)

    api_url = (
        f"https://api.github.com/repos/{UPSTREAM_REPO}/contents/{UPSTREAM_DIR}"
        f"?ref={UPSTREAM_COMMIT}"
    )
    listing = request_json(api_url)
    candidates = [
        item
        for item in listing
        if item.get("type") == "file"
        and item.get("name", "").lower().endswith(".pdf")
        and MIN_BYTES <= int(item.get("size", 0)) <= MAX_BYTES
        and item.get("download_url")
    ]
    candidates.sort(key=candidate_order)

    accepted: list[dict] = []
    rejected: list[dict] = []
    for item in candidates:
        if len(accepted) >= TARGET_COUNT:
            break
        # The local filename is intentionally independent of the upstream name so
        # Playwright can address a deterministic sample without Node filesystem APIs.
        safe_name = f"{len(accepted)+1:02d}.pdf"
        path = OUTPUT / safe_name
        try:
            data = download(item["download_url"], path)
            if not data.startswith(b"%PDF-"):
                raise ValueError("missing PDF header")
            page_count, readers = validate_pdf(path)
            accepted.append(
                {
                    "id": f"EXT-{len(accepted)+1:02d}",
                    "filename": safe_name,
                    "upstream_name": item["name"],
                    "upstream_blob_sha": item["sha"],
                    "source_url": item["html_url"],
                    "bytes": len(data),
                    "sha256": hashlib.sha256(data).hexdigest(),
                    "pages": page_count,
                    "validated_by": readers,
                }
            )
        except Exception as exc:
            path.unlink(missing_ok=True)
            rejected.append({"upstream_name": item.get("name"), "reason": str(exc)})

    if len(accepted) != TARGET_COUNT:
        raise SystemExit(
            f"R8 external corpus incomplete: accepted {len(accepted)} of {TARGET_COUNT}; "
            f"rejected {len(rejected)}"
        )

    manifest = {
        "schema": 1,
        "corpus_id": f"r8-pdfjs-{UPSTREAM_COMMIT[:12]}",
        "source_repository": UPSTREAM_REPO,
        "source_commit": UPSTREAM_COMMIT,
        "selection_policy": {
            "target_count": TARGET_COUNT,
            "min_bytes": MIN_BYTES,
            "max_bytes": MAX_BYTES,
            "max_pages": MAX_PAGES,
            "ordering": "sha256(filename)",
            "local_filenames": "01.pdf through 25.pdf in acceptance order",
            "requirements": ["PDF header", "unencrypted", "PyMuPDF opens", "pypdf page tree agrees"],
        },
        "documents": accepted,
        "rejected_candidates": rejected,
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"passed": True, "external_documents": len(accepted), "manifest": str(MANIFEST)}, indent=2))


if __name__ == "__main__":
    main()
