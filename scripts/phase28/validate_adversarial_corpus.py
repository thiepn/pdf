#!/usr/bin/env python3
"""Validate the Phase 28 corpus with PyMuPDF and pypdf plus visual invariants."""
from __future__ import annotations
import hashlib, json, logging, time
from pathlib import Path
from typing import Any
import fitz
from pypdf import PdfReader

logging.getLogger("pypdf").setLevel(logging.ERROR)
ROOT=Path(__file__).resolve().parents[2]
CORPUS=ROOT/"tests"/"corpus"/"phase28"
REPORT=ROOT/"docs"/"phase-28"/"adversarial-corpus-report.json"


def sha256(path:Path)->str: return hashlib.sha256(path.read_bytes()).hexdigest()

def fitz_validate(path:Path, expect:dict[str,Any])->dict[str,Any]:
    result={"engine":"PyMuPDF","passed":True,"checks":[]}; started=time.perf_counter()
    def ck(name, ok, detail=None):
        result["checks"].append({"name":name,"passed":bool(ok),"detail":detail})
        if not ok: result["passed"]=False
    try:
        doc=fitz.open(path); encrypted=bool(doc.needs_pass or doc.is_encrypted)
        if doc.needs_pass:
            ok=bool(doc.authenticate(expect.get("password",""))); ck("authenticate",ok)
            if not ok: return result
        text="\n".join(p.get_text() for p in doc); result["pages"]=doc.page_count
        if "pages" in expect: ck("pages",doc.page_count==expect["pages"],doc.page_count)
        for m in expect.get("text",[]): ck(f"text:{m}",m in text)
        for m in expect.get("text_absent",[]): ck(f"text-absent:{m}",m not in text)
        if "text_length_max" in expect: ck("text-length",len(text.strip())<=expect["text_length_max"],len(text.strip()))
        ann=sum(1 for p in doc for _ in (p.annots() or [])); links=sum(len(p.get_links()) for p in doc); forms=sum(1 for p in doc for _ in (p.widgets() or [])); images=sum(len(p.get_images(full=True)) for p in doc); drawings=sum(len(p.get_drawings()) for p in doc)
        if "annotations_min" in expect: ck("annotations",ann>=expect["annotations_min"],ann)
        if "links_min" in expect: ck("links",links>=expect["links_min"],links)
        if "form_fields_min" in expect: ck("forms",forms>=expect["form_fields_min"],forms)
        if "images_min" in expect: ck("images",images>=expect["images_min"],images)
        if "drawings_min" in expect: ck("drawings",drawings>=expect["drawings_min"],drawings)
        if "bookmarks_min" in expect: ck("bookmarks",len(doc.get_toc())>=expect["bookmarks_min"],len(doc.get_toc()))
        if "attachments_min" in expect: ck("attachments",doc.embfile_count()>=expect["attachments_min"],doc.embfile_count())
        if "metadata_contains" in expect: ck("metadata",expect["metadata_contains"] in json.dumps(doc.metadata,ensure_ascii=False))
        if expect.get("encrypted"): ck("encrypted",encrypted)
        if "rotations" in expect: ck("rotations",[p.rotation for p in doc]==expect["rotations"],[p.rotation for p in doc])
        if expect.get("mixed_sizes"):
            sizes={(round(p.rect.width,1),round(p.rect.height,1)) for p in doc}; ck("mixed-sizes",len(sizes)>1,len(sizes))
        if expect.get("cropbox_inset"):
            p=doc[0]; ck("cropbox-inset",p.cropbox.width < p.mediabox.width and p.cropbox.height < p.mediabox.height)
        # Visual smoke: first/last page must render to a non-empty pixmap for every valid fixture.
        if doc.page_count:
            indices=sorted(set([0,doc.page_count-1]))
            for idx in indices:
                pix=doc[idx].get_pixmap(matrix=fitz.Matrix(0.25,0.25),alpha=False)
                ck(f"render:{idx+1}",pix.width>0 and pix.height>0 and len(pix.samples)>0,(pix.width,pix.height))
        doc.close()
    except Exception as exc:
        if expect.get("malformed"):
            result["checks"].append({"name":"malformed-rejected","passed":True,"detail":str(exc)})
        else:
            result["passed"]=False; result["error"]=str(exc)
    result["durationMs"]=round((time.perf_counter()-started)*1000,2); return result


def pypdf_validate(path:Path, expect:dict[str,Any])->dict[str,Any]:
    result={"engine":"pypdf","passed":True,"checks":[]}; started=time.perf_counter()
    def ck(name, ok, detail=None):
        result["checks"].append({"name":name,"passed":bool(ok),"detail":detail})
        if not ok: result["passed"]=False
    try:
        r=PdfReader(str(path),strict=False)
        if r.is_encrypted:
            ok=bool(r.decrypt(expect.get("password",""))); ck("authenticate",ok)
            if not ok: return result
        pages=len(r.pages); text="\n".join((p.extract_text() or "") for p in r.pages)
        if "pages" in expect: ck("pages",pages==expect["pages"],pages)
        for m in expect.get("text",[]):
            # CJK extraction differs between engines; ASCII marker fragments remain authoritative here.
            if all(ord(c)<128 for c in m): ck(f"text:{m}",m in text)
        for m in expect.get("text_absent",[]): ck(f"text-absent:{m}",m not in text)
        if "form_fields_min" in expect: ck("forms",len(r.get_fields() or {})>=expect["form_fields_min"],len(r.get_fields() or {}))
    except Exception as exc:
        if expect.get("malformed") or expect.get("may_recover"):
            result["checks"].append({"name":"adversarial-handled","passed":True,"detail":str(exc)})
        else:
            result["passed"]=False; result["error"]=str(exc)
    result["durationMs"]=round((time.perf_counter()-started)*1000,2); return result


def main():
    manifest=json.loads((CORPUS/"manifest.json").read_text(encoding="utf-8")); rows=[]; passed=True
    for entry in manifest["files"]:
        path=CORPUS/entry["filename"]; checksum_ok=path.exists() and sha256(path)==entry["sha256"]
        results=[fitz_validate(path,entry["expect"]),pypdf_validate(path,entry["expect"])]
        row=checksum_ok and all(x["passed"] for x in results); passed=passed and row
        rows.append({"filename":entry["filename"],"checksum":checksum_ok,"passed":row,"engines":results})
    report={"schemaVersion":1,"passed":passed,"corpusFiles":len(rows),"results":rows}
    REPORT.parent.mkdir(parents=True,exist_ok=True); REPORT.write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print(json.dumps({"passed":passed,"files":len(rows),"report":str(REPORT)},indent=2))
    if not passed: raise SystemExit(1)
if __name__=="__main__": main()
