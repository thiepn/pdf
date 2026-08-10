#!/usr/bin/env python3
"""Generate deterministic Phase 28 adversarial PDF fixtures.

All fixtures are synthetic and redistributable. They are intentionally small except
for a few scale fixtures used to exercise page-count and image-memory boundaries.
"""
from __future__ import annotations

import hashlib
import io
import json
import os
from pathlib import Path

import fitz
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "tests" / "corpus" / "phase28"
OUT.mkdir(parents=True, exist_ok=True)
A4 = fitz.paper_rect("a4")
LETTER = fitz.paper_rect("letter")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(doc: fitz.Document, name: str, **kwargs) -> Path:
    path = OUT / name
    if path.exists(): path.unlink()
    doc.save(path, garbage=4, deflate=True, **kwargs)
    doc.close()
    return path


def marker_doc(name: str, pages: int = 1, width: float = A4.width, height: float = A4.height, rotate: int = 0) -> Path:
    doc = fitz.open()
    marker = name.removesuffix(".pdf").upper().replace("-", "_")
    for i in range(pages):
        page = doc.new_page(width=width, height=height)
        font_size = 6 if width <= 100 or height <= 100 else 12
        x = 4 if width <= 100 else 36
        y = 12 if height <= 100 else 50
        page.insert_text((x, y), f"{marker}_PAGE_{i+1}", fontsize=font_size)
        if width > 100 and height > 100:
            page.draw_rect(fitz.Rect(36, 75, min(width - 36, 260), min(height - 36, 150)), color=(0.1, 0.2, 0.6), fill=(0.9, 0.93, 1))
        if rotate: page.set_rotation(rotate)
    return save(doc, name)


def geometry_fixtures(entries: list[tuple[Path, dict]]) -> None:
    specs = [
        ("rotation-0.pdf", A4.width, A4.height, 0),
        ("rotation-90.pdf", A4.width, A4.height, 90),
        ("rotation-180.pdf", A4.width, A4.height, 180),
        ("rotation-270.pdf", A4.width, A4.height, 270),
        ("tiny-page.pdf", 72, 72, 0),
        ("huge-page.pdf", 2400, 1800, 0),
        ("landscape-letter.pdf", LETTER.height, LETTER.width, 0),
        ("square-page.pdf", 420, 420, 0),
    ]
    for name, width, height, rotation in specs:
        path = marker_doc(name, width=width, height=height, rotate=rotation)
        entries.append((path, {"pages": 1, "text": [name.removesuffix('.pdf').upper().replace('-', '_')] , "rotations": [rotation]}))

    doc = fitz.open()
    page = doc.new_page(width=A4.width, height=A4.height)
    page.insert_text((60, 80), "CROPBOX_MARKER", fontsize=14)
    page.set_cropbox(fitz.Rect(30, 40, A4.width - 35, A4.height - 45))
    entries.append((save(doc, "cropbox-inset.pdf"), {"pages": 1, "text": ["CROPBOX_MARKER"], "cropbox_inset": True}))

    doc = fitz.open()
    sizes = [(A4.width, A4.height), (LETTER.width, LETTER.height), (400, 700), (900, 420), (240, 240)]
    for i, (w, h) in enumerate(sizes):
        page = doc.new_page(width=w, height=h)
        page.insert_text((24, 36), f"MIXED_SIZE_{i+1}", fontsize=10)
    entries.append((save(doc, "mixed-page-sizes.pdf"), {"pages": 5, "text": ["MIXED_SIZE_1", "MIXED_SIZE_5"], "mixed_sizes": True}))

    doc = fitz.open()
    page = doc.new_page(width=A4.width, height=A4.height)
    page.set_mediabox(fitz.Rect(20, 30, A4.width + 20, A4.height + 30))
    page.insert_text((72, 90), "NONZERO_MEDIABOX_ORIGIN", fontsize=12)
    entries.append((save(doc, "nonzero-mediabox-origin.pdf"), {"pages": 1, "text": ["NONZERO_MEDIABOX_ORIGIN"]}))


def text_font_fixtures(entries: list[tuple[Path, dict]]) -> None:
    doc = fitz.open(); page = doc.new_page(width=A4.width, height=A4.height)
    page.insert_text((50, 60), "ASCII_LATIN_FONT_MATRIX", fontname="helv", fontsize=11)
    page.insert_text((50, 100), "SERIF_MARKER", fontname="tiro", fontsize=11)
    page.insert_text((50, 140), "MONO_MARKER", fontname="cour", fontsize=11)
    entries.append((save(doc, "standard-fonts.pdf"), {"pages": 1, "text": ["ASCII_LATIN_FONT_MATRIX", "SERIF_MARKER", "MONO_MARKER"]}))

    doc = fitz.open(); page = doc.new_page(width=A4.width, height=A4.height)
    page.insert_text((50, 40), "CJK_ASCII_MARKER", fontname="helv", fontsize=11)
    page.insert_text((50, 70), "한국어 CJK KOREAN MARKER", fontname="korea", fontsize=13)
    page.insert_text((50, 110), "中文 CJK CHINESE MARKER", fontname="china-s", fontsize=13)
    page.insert_text((50, 150), "日本語 CJK JAPANESE MARKER", fontname="japan", fontsize=13)
    entries.append((save(doc, "cjk-mixed.pdf"), {"pages": 1, "text": ["CJK_ASCII_MARKER"]}))

    arabic_fonts = [
        Path("/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf"),
        Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts" / "NotoNaskhArabic-Regular.ttf",
    ]
    arabic_font = next((path for path in arabic_fonts if path.is_file()), None)
    doc = fitz.open(); page = doc.new_page(width=A4.width, height=A4.height)
    page.insert_text((50, 50), "RTL_ASCII_MARKER", fontname="helv", fontsize=11)
    if arabic_font:
        page.insert_font(fontname="NotoArabic", fontfile=str(arabic_font))
        page.insert_text((50, 90), "اختبار عربي", fontname="NotoArabic", fontsize=15)
    entries.append((save(doc, "rtl-arabic.pdf"), {"pages": 1, "text": ["RTL_ASCII_MARKER"]}))

    for idx in range(1, 6):
        doc = fitz.open(); page = doc.new_page(width=A4.width, height=A4.height)
        for line in range(1, 45):
            page.insert_text((40, 25 + line * 16), f"DENSE_TEXT_{idx:02d}_{line:02d} deterministic extraction line", fontsize=7.5)
        entries.append((save(doc, f"dense-text-{idx:02d}.pdf"), {"pages": 1, "text": [f"DENSE_TEXT_{idx:02d}_01", f"DENSE_TEXT_{idx:02d}_44"]}))

    doc = fitz.open(); page = doc.new_page(width=A4.width, height=A4.height)
    entries.append((save(doc, "blank-page.pdf"), {"pages": 1, "text_length_max": 1}))


def annotation_link_fixtures(entries: list[tuple[Path, dict]]) -> None:
    doc = fitz.open(); page = doc.new_page(width=A4.width, height=A4.height)
    page.insert_text((50, 60), "ANNOTATION_VARIANTS", fontsize=13)
    page.add_text_annot((50, 100), "note").update()
    page.add_rect_annot(fitz.Rect(50, 130, 180, 190)).update()
    page.add_circle_annot(fitz.Rect(210, 130, 280, 200)).update()
    page.add_ink_annot([[(50, 250), (120, 225), (200, 260)]]).update()
    page.add_line_annot((50, 310), (220, 330)).update()
    entries.append((save(doc, "annotation-variants.pdf"), {"pages": 1, "text": ["ANNOTATION_VARIANTS"], "annotations_min": 5}))

    doc = fitz.open(); page = doc.new_page(width=A4.width, height=A4.height)
    page.insert_text((50, 60), "LINK_VARIANTS", fontsize=13)
    page.insert_link({"kind": fitz.LINK_URI, "from": fitz.Rect(50, 90, 220, 115), "uri": "https://example.invalid/a"})
    page.insert_link({"kind": fitz.LINK_URI, "from": fitz.Rect(50, 130, 220, 155), "uri": "mailto:test@example.invalid"})
    entries.append((save(doc, "external-links.pdf"), {"pages": 1, "text": ["LINK_VARIANTS"], "links_min": 2}))

    doc = fitz.open()
    for i in range(3):
        p = doc.new_page(width=A4.width, height=A4.height); p.insert_text((50, 60), f"INTERNAL_LINK_PAGE_{i+1}", fontsize=12)
    doc[0].insert_link({"kind": fitz.LINK_GOTO, "from": fitz.Rect(50, 100, 220, 130), "page": 2, "to": fitz.Point(0, 0)})
    entries.append((save(doc, "internal-links.pdf"), {"pages": 3, "text": ["INTERNAL_LINK_PAGE_1", "INTERNAL_LINK_PAGE_3"], "links_min": 1}))


def forms_fixtures(entries: list[tuple[Path, dict]]) -> None:
    doc = fitz.open(); page = doc.new_page(width=A4.width, height=A4.height); page.insert_text((50, 50), "FORM_MATRIX", fontsize=13)
    text = fitz.Widget(); text.field_name="name"; text.field_type=fitz.PDF_WIDGET_TYPE_TEXT; text.rect=fitz.Rect(50,80,280,110); text.field_value="Grace Hopper"; page.add_widget(text)
    check = fitz.Widget(); check.field_name="agree"; check.field_type=fitz.PDF_WIDGET_TYPE_CHECKBOX; check.rect=fitz.Rect(50,135,70,155); check.field_value="Yes"; page.add_widget(check)
    combo = fitz.Widget(); combo.field_name="choice"; combo.field_type=fitz.PDF_WIDGET_TYPE_COMBOBOX; combo.rect=fitz.Rect(50,180,220,210); combo.choice_values=["One","Two","Three"]; combo.field_value="Two"; page.add_widget(combo)
    lst = fitz.Widget(); lst.field_name="list"; lst.field_type=fitz.PDF_WIDGET_TYPE_LISTBOX; lst.rect=fitz.Rect(50,240,220,310); lst.choice_values=["Alpha","Beta","Gamma"]; lst.field_value="Beta"; page.add_widget(lst)
    entries.append((save(doc, "forms-matrix.pdf"), {"pages": 1, "text": ["FORM_MATRIX"], "form_fields_min": 4}))

    doc = fitz.open(); page = doc.new_page(width=A4.width, height=A4.height); page.insert_text((50,50),"MANY_FORMS",fontsize=13)
    for i in range(20):
        w=fitz.Widget(); w.field_name=f"field_{i:02d}"; w.field_type=fitz.PDF_WIDGET_TYPE_TEXT; row=i%10; col=i//10; x=50+col*250; y=80+row*45; w.rect=fitz.Rect(x,y,x+190,y+28); w.field_value=f"value-{i:02d}"; page.add_widget(w)
    entries.append((save(doc, "forms-20-fields.pdf"), {"pages": 1, "text": ["MANY_FORMS"], "form_fields_min": 20}))


def image_vector_fixtures(entries: list[tuple[Path, dict]]) -> None:
    image = Image.new("RGB", (1024, 768), "white")
    draw = ImageDraw.Draw(image)
    for x in range(0, 1024, 32): draw.line((x, 0, 1024-x, 768), fill=(x % 255, 80, 160), width=3)
    draw.text((30, 30), "PHASE28_IMAGE", fill="black")
    buf = io.BytesIO(); image.save(buf, format="PNG", optimize=True); png = buf.getvalue()

    doc=fitz.open(); page=doc.new_page(width=A4.width,height=A4.height); page.insert_text((40,40),"IMAGE_SINGLE",fontsize=12); page.insert_image(fitz.Rect(40,70,540,445), stream=png)
    entries.append((save(doc,"image-single.pdf"), {"pages":1,"text":["IMAGE_SINGLE"],"images_min":1}))

    doc=fitz.open(); page=doc.new_page(width=A4.width,height=A4.height); page.insert_text((40,40),"IMAGE_MANY",fontsize=12)
    for row in range(4):
        for col in range(3):
            x=40+col*170; y=70+row*150; page.insert_image(fitz.Rect(x,y,x+145,y+110), stream=png)
    entries.append((save(doc,"images-12.pdf"), {"pages":1,"text":["IMAGE_MANY"],"images_min":12}))

    doc=fitz.open(); page=doc.new_page(width=A4.width,height=A4.height); page.insert_text((40,40),"VECTOR_DENSE",fontsize=12)
    for i in range(120):
        x=30+(i%12)*42; y=70+(i//12)*55
        page.draw_rect(fitz.Rect(x,y,x+30,y+35), color=((i%3)/2, ((i+1)%3)/2, ((i+2)%3)/2), fill=(0.9,0.9,0.9), width=0.7)
    entries.append((save(doc,"vector-dense.pdf"), {"pages":1,"text":["VECTOR_DENSE"],"drawings_min":100}))

    doc=fitz.open(); page=doc.new_page(width=A4.width,height=A4.height); page.insert_text((40,40),"TRANSPARENCY_MARKER",fontsize=12)
    page.draw_rect(fitz.Rect(60,90,300,280), fill=(1,0,0), fill_opacity=0.5, color=(1,0,0)); page.draw_rect(fitz.Rect(180,170,420,360), fill=(0,0,1), fill_opacity=0.5, color=(0,0,1))
    entries.append((save(doc,"transparency.pdf"), {"pages":1,"text":["TRANSPARENCY_MARKER"]}))


def structure_fixtures(entries: list[tuple[Path, dict]]) -> None:
    doc=fitz.open()
    for i in range(5):
        p=doc.new_page(width=A4.width,height=A4.height); p.insert_text((50,60),f"BOOKMARK_PAGE_{i+1}",fontsize=12)
    doc.set_toc([[1,"Root",1],[2,"Child A",2],[2,"Child B",3],[1,"Second root",4],[2,"Last",5]])
    entries.append((save(doc,"nested-bookmarks.pdf"), {"pages":5,"text":["BOOKMARK_PAGE_1","BOOKMARK_PAGE_5"],"bookmarks_min":5}))

    doc=fitz.open(); p=doc.new_page(width=A4.width,height=A4.height); p.insert_text((50,60),"ATTACHMENTS_MARKER",fontsize=12); doc.embfile_add("hello.txt", b"phase28 attachment\n", filename="hello.txt", desc="Synthetic attachment")
    entries.append((save(doc,"embedded-attachment.pdf"), {"pages":1,"text":["ATTACHMENTS_MARKER"],"attachments_min":1}))

    doc=fitz.open(); p=doc.new_page(width=A4.width,height=A4.height); p.insert_text((50,60),"UNICODE_METADATA_MARKER",fontsize=12); doc.set_metadata({"title":"Phase 28 — 한국어 中文 日本語","author":"Åda Çalışkan","subject":"Δοκιμή metadata"})
    entries.append((save(doc,"unicode-metadata.pdf"), {"pages":1,"text":["UNICODE_METADATA_MARKER"],"metadata_contains":"한국어"}))

    doc=fitz.open()
    for i in range(4):
        p=doc.new_page(width=A4.width,height=A4.height); p.insert_text((50,60),f"PAGE_LABEL_{i+1}",fontsize=12)
    try: doc.set_page_labels([{"startpage":0,"prefix":"A-","style":"D","firstpagenum":1}])
    except Exception: pass
    entries.append((save(doc,"page-labels.pdf"), {"pages":4,"text":["PAGE_LABEL_1","PAGE_LABEL_4"]}))

    doc=fitz.open(); p=doc.new_page(width=A4.width,height=A4.height); p.insert_text((50,60),"OPTIONAL_CONTENT_MARKER",fontsize=12)
    try:
        ocg=doc.add_ocg("Phase28 Layer", on=True); p.insert_text((50,110),"LAYER_TEXT",fontsize=12,oc=ocg)
    except Exception:
        p.insert_text((50,110),"LAYER_TEXT",fontsize=12)
    entries.append((save(doc,"optional-content.pdf"), {"pages":1,"text":["OPTIONAL_CONTENT_MARKER","LAYER_TEXT"]}))


def encryption_incremental_fixtures(entries: list[tuple[Path, dict]]) -> None:
    for bits, enc in [("aes128", fitz.PDF_ENCRYPT_AES_128), ("aes256", fitz.PDF_ENCRYPT_AES_256)]:
        doc=fitz.open(); p=doc.new_page(width=A4.width,height=A4.height); p.insert_text((50,80),f"ENCRYPTED_{bits.upper()}",fontsize=12)
        path=OUT/f"encrypted-{bits}.pdf"; path.unlink(missing_ok=True)
        doc.save(path,encryption=enc,owner_pw="phase28-owner",user_pw="phase28-user",permissions=fitz.PDF_PERM_PRINT|fitz.PDF_PERM_COPY,garbage=4,deflate=True); doc.close()
        entries.append((path,{"pages":1,"encrypted":True,"password":"phase28-user","text":[f"ENCRYPTED_{bits.upper()}"]}))

    path=OUT/"incremental-three-revisions.pdf"; path.unlink(missing_ok=True)
    doc=fitz.open(); p=doc.new_page(width=A4.width,height=A4.height); p.insert_text((50,80),"INCR_REV_1",fontsize=12); doc.save(path); doc.close()
    for rev in [2,3]:
        doc=fitz.open(path); doc[0].insert_text((50,80+rev*45),f"INCR_REV_{rev}",fontsize=12); doc.saveIncr(); doc.close()
    entries.append((path,{"pages":1,"text":["INCR_REV_1","INCR_REV_2","INCR_REV_3"],"incremental":True}))

    doc=fitz.open(); p=doc.new_page(width=A4.width,height=A4.height); p.insert_text((50,80),"REDACTION_SECRET_928",fontsize=12); p.insert_text((50,130),"REDACTION_PUBLIC",fontsize=12); base=save(doc,"redaction-before.pdf")
    entries.append((base,{"pages":1,"text":["REDACTION_SECRET_928","REDACTION_PUBLIC"]}))
    doc=fitz.open(base); p=doc[0]
    for r in p.search_for("REDACTION_SECRET_928"): p.add_redact_annot(r,fill=(0,0,0))
    p.apply_redactions(); entries.append((save(doc,"redaction-after.pdf"),{"pages":1,"text":["REDACTION_PUBLIC"],"text_absent":["REDACTION_SECRET_928"]}))


def scale_fixtures(entries: list[tuple[Path, dict]]) -> None:
    for count in [50, 300, 1000]:
        doc=fitz.open()
        for i in range(count):
            p=doc.new_page(width=300,height=420); p.insert_text((20,30),f"PAGES_{count}_{i+1:04d}",fontsize=7)
        entries.append((save(doc,f"pages-{count}.pdf"),{"pages":count,"text":[f"PAGES_{count}_0001",f"PAGES_{count}_{count:04d}"]}))


def malformed_fixtures(entries: list[tuple[Path, dict]]) -> None:
    source=(OUT/"standard-fonts.pdf").read_bytes()
    cuts=[64,128,max(256,len(source)//4),max(512,len(source)//2)]
    for i,cut in enumerate(cuts,1):
        path=OUT/f"malformed-truncated-{i}.pdf"; path.write_bytes(source[:cut]); entries.append((path,{"malformed":True}))
    path=OUT/"malformed-garbage-prefix.pdf"; path.write_bytes(b"GARBAGE-PREFIX\x00\x01\n"+source); entries.append((path,{"malformed":True,"may_recover":True}))
    path=OUT/"malformed-garbage-suffix.pdf"; path.write_bytes(source+b"\nGARBAGE-SUFFIX\x00\x01"); entries.append((path,{"pages":1,"text":["ASCII_LATIN_FONT_MATRIX"],"may_recover":True}))


def duplicate_variants(entries: list[tuple[Path, dict]]) -> None:
    for i in range(1,9):
        doc=fitz.open(); p=doc.new_page(width=A4.width,height=A4.height); p.insert_text((45,60),f"EDGE_VARIANT_{i:02d}",fontsize=11)
        # Deterministic combinations of rotation/crop/links/annotations.
        if i%2==0: p.set_rotation(90)
        if i%3==0: p.set_cropbox(fitz.Rect(10,20,A4.width-10,A4.height-20))
        if i%4==0: p.add_text_annot((80,120),f"note-{i}").update()
        if i%5==0: p.insert_link({"kind":fitz.LINK_URI,"from":fitz.Rect(60,160,240,185),"uri":f"https://example.invalid/{i}"})
        entries.append((save(doc,f"edge-variant-{i:02d}.pdf"),{"pages":1,"text":[f"EDGE_VARIANT_{i:02d}"]}))


def main() -> None:
    for path in OUT.glob("*"):
        if path.is_file(): path.unlink()
    entries: list[tuple[Path, dict]]=[]
    geometry_fixtures(entries); text_font_fixtures(entries); annotation_link_fixtures(entries); forms_fixtures(entries)
    image_vector_fixtures(entries); structure_fixtures(entries); encryption_incremental_fixtures(entries); scale_fixtures(entries)
    malformed_fixtures(entries); duplicate_variants(entries)
    manifest={
        "schemaVersion":1,
        "generatedBy":"PDF Studio Phase 28",
        "files":[{"filename":p.name,"byteLength":p.stat().st_size,"sha256":sha256(p),"expect":e} for p,e in sorted(entries,key=lambda item:item[0].name)]
    }
    (OUT/"manifest.json").write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print(json.dumps({"output":str(OUT),"files":len(entries),"bytes":sum(p.stat().st_size for p,_ in entries)},indent=2))

if __name__=="__main__": main()
