"""PDF utility operations: protect (AES-256), unlock, repair, compress,
flatten, metadata removal, image extraction, crop, page-size conversion,
deskew scans. All local."""
from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import zipfile
from typing import List, Optional

import fitz
import pikepdf


# ---------- protect / unlock ----------

def protect(src: str, out: str, user_pw: str, owner_pw: str = "",
            allow_print: bool = True, allow_copy: bool = False,
            allow_modify: bool = False) -> dict:
    perms = pikepdf.Permissions(
        extract=allow_copy,
        modify_annotation=allow_modify,
        modify_assembly=False,
        modify_form=allow_modify,
        modify_other=allow_modify,
        print_highres=allow_print,
        print_lowres=allow_print,
    )
    with pikepdf.open(src) as pdf:
        pdf.save(out, encryption=pikepdf.Encryption(
            user=user_pw, owner=owner_pw or user_pw, R=6, allow=perms))
    return {"encryption": "AES-256 (R6)"}


def unlock(src: str, out: str, password: str = "") -> dict:
    with pikepdf.open(src, password=password) as pdf:
        pdf.save(out)
    return {"unlocked": True}


# ---------- repair ----------

def repair(src: str, out: str, password: str = "") -> dict:
    """pikepdf round-trip fixes xref/structure damage; Ghostscript rebuild as
    a second-chance fallback for badly broken files."""
    try:
        with pikepdf.open(src, password=password or "") as pdf:
            pdf.save(out, fix_metadata_version=True)
        return {"engine": "pikepdf"}
    except Exception as first:
        gs = shutil.which("gs") or shutil.which("gswin64c")
        if not gs:
            raise RuntimeError(f"repair failed ({first}) and Ghostscript not available")
        r = subprocess.run([gs, "-o", out, "-sDEVICE=pdfwrite",
                            "-dPDFSETTINGS=/prepress", src],
                           capture_output=True, text=True, timeout=600)
        if not os.path.exists(out) or os.path.getsize(out) < 100:
            raise RuntimeError("repair failed: " + (r.stderr or "")[:300])
        return {"engine": "ghostscript"}


# ---------- compress ----------

_GS_PRESETS = {"screen": "/screen", "ebook": "/ebook",
               "printer": "/printer", "prepress": "/prepress"}


_IMG_PRESETS = {"light": (150, 78), "balanced": (120, 65), "strong": (96, 50)}


def _is_image_dominated(path: str) -> bool:
    doc = fitz.open(path)
    imgy = 0
    n = min(5, doc.page_count)
    for i in range(n):
        page = doc[i]
        if len(page.get_text("text").strip()) < 30 and page.get_images():
            imgy += 1
    doc.close()
    return n > 0 and imgy >= max(1, n - 1)


def _compress_scanned(src: str, out: str, preset: str) -> dict:
    """Rebuild image pages at target DPI/JPEG quality — far better than
    generic Ghostscript presets for scans."""
    import io
    from PIL import Image

    dpi, q = _IMG_PRESETS.get(preset, _IMG_PRESETS["balanced"])
    doc = fitz.open(src)
    newdoc = fitz.open()
    for page in doc:
        if len(page.get_text("text").strip()) >= 30:
            newdoc.insert_pdf(doc, from_page=page.number, to_page=page.number)
            continue
        pix = page.get_pixmap(dpi=dpi)
        img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=q, optimize=True)
        np_ = newdoc.new_page(width=page.rect.width, height=page.rect.height)
        np_.insert_image(np_.rect, stream=buf.getvalue())
    newdoc.save(out, garbage=4, deflate=True)
    newdoc.close()
    doc.close()
    orig, new = os.path.getsize(src), os.path.getsize(out)
    if new >= orig:
        shutil.copyfile(src, out)
        new = orig
    return {"engine": "propdf-scan", "before": orig, "after": new,
            "saved_pct": round(100 * (1 - new / orig), 1)}


def compress(src: str, out: str, preset: str = "ebook") -> dict:
    orig = os.path.getsize(src)
    if _is_image_dominated(src):
        scan_preset = {"screen": "strong", "ebook": "balanced",
                       "printer": "light", "prepress": "light"}.get(preset, preset)
        return _compress_scanned(src, out, scan_preset)
    gs = shutil.which("gs") or shutil.which("gswin64c")
    if gs:
        r = subprocess.run(
            [gs, "-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.6",
             f"-dPDFSETTINGS={_GS_PRESETS.get(preset, '/ebook')}",
             "-dNOPAUSE", "-dQUIET", "-dBATCH", f"-sOutputFile={out}", src],
            capture_output=True, text=True, timeout=900)
        if os.path.exists(out) and os.path.getsize(out) > 100:
            new = os.path.getsize(out)
            if new < orig:
                return {"engine": "ghostscript", "before": orig, "after": new,
                        "saved_pct": round(100 * (1 - new / orig), 1)}
    # fallback: pikepdf stream recompression (never worse than original)
    with pikepdf.open(src) as pdf:
        pdf.save(out, compress_streams=True, recompress_flate=True,
                 object_stream_mode=pikepdf.ObjectStreamMode.generate)
    new = os.path.getsize(out)
    if new >= orig:
        shutil.copyfile(src, out)
        new = orig
    return {"engine": "pikepdf", "before": orig, "after": new,
            "saved_pct": round(100 * (1 - new / orig), 1)}


# ---------- flatten ----------

def flatten(src: str, out: str) -> dict:
    """Flatten form fields and annotations into page content."""
    doc = fitz.open(src)
    try:
        doc.bake()  # PyMuPDF >= 1.23: bakes widgets/annotations into content
        baked = True
    except Exception:
        baked = False
    if not baked:
        # fallback: rasterize-free conversion via re-writing appearances
        for page in doc:
            for w in page.widgets() or []:
                try:
                    w.update()
                except Exception:
                    pass
    doc.save(out, garbage=3, deflate=True)
    doc.close()
    return {"flattened": True, "method": "bake" if baked else "appearance"}


# ---------- metadata removal ----------

def strip_metadata(src: str, out: str) -> dict:
    with pikepdf.open(src) as pdf:
        try:
            del pdf.Root.Metadata
        except Exception:
            pass
        try:
            pdf.trailer["/Info"] = pdf.make_indirect(pikepdf.Dictionary())
        except Exception:
            pass
        with pdf.open_metadata(set_pikepdf_as_editor=False) as meta:
            keys = list(meta.keys())
            for k in keys:
                try:
                    del meta[k]
                except Exception:
                    pass
        pdf.save(out)
    return {"removed": True}


# ---------- image extraction ----------

def extract_images(src: str, out_zip: str, min_px: int = 24) -> dict:
    doc = fitz.open(src)
    count = 0
    with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_DEFLATED) as z:
        seen = set()
        for pno in range(doc.page_count):
            for img in doc[pno].get_images(full=True):
                xref = img[0]
                if xref in seen:
                    continue
                seen.add(xref)
                try:
                    pix = fitz.Pixmap(doc, xref)
                    if pix.width < min_px or pix.height < min_px:
                        continue
                    if pix.colorspace and pix.colorspace.n >= 4:
                        pix = fitz.Pixmap(fitz.csRGB, pix)
                    count += 1
                    z.writestr(f"page{pno+1:03d}_img{count:03d}.png",
                               pix.tobytes("png"))
                except Exception:
                    continue
    doc.close()
    return {"images": count}


# ---------- crop / page size ----------

def crop(src: str, out: str, top: float, right: float, bottom: float,
         left: float, pages: Optional[List[int]] = None) -> dict:
    doc = fitz.open(src)
    targets = pages or list(range(1, doc.page_count + 1))
    for pno in targets:
        page = doc[pno - 1]
        r = page.rect
        new = fitz.Rect(r.x0 + left, r.y0 + top, r.x1 - right, r.y1 - bottom)
        if new.is_valid and not new.is_empty:
            page.set_cropbox(new)
    doc.save(out, garbage=2)
    doc.close()
    return {"cropped_pages": len(targets)}


_PAGE_SIZES = {"a4": (595.28, 841.89), "letter": (612, 792),
               "legal": (612, 1008), "a3": (841.89, 1190.55),
               "a5": (419.53, 595.28)}


def resize_pages(src: str, out: str, size: str = "a4",
                 keep_ratio: bool = True) -> dict:
    w, h = _PAGE_SIZES.get(size, _PAGE_SIZES["a4"])
    doc = fitz.open(src)
    newdoc = fitz.open()
    for page in doc:
        landscape = page.rect.width > page.rect.height
        pw, ph = (h, w) if landscape else (w, h)
        np_ = newdoc.new_page(width=pw, height=ph)
        np_.show_pdf_page(fitz.Rect(0, 0, pw, ph), doc, page.number,
                          keep_proportion=keep_ratio)
    newdoc.save(out, garbage=3, deflate=True)
    n = doc.page_count
    newdoc.close()
    doc.close()
    return {"pages": n, "size": size}


# ---------- deskew scans ----------

def deskew_pdf(src: str, out: str, dpi: int = 200) -> dict:
    from .ocr import render_page, deskew as _deskew, fix_orientation
    import io

    doc = fitz.open(src)
    newdoc = fitz.open()
    corrected = 0
    for pno in range(doc.page_count):
        page = doc[pno]
        if len(page.get_text("text").strip()) >= 30:
            newdoc.insert_pdf(doc, from_page=pno, to_page=pno)
            continue
        img = render_page(doc, pno + 1, dpi)
        img, rot = fix_orientation(img)
        img, ang = _deskew(img)
        if rot or ang:
            corrected += 1
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=85)
        r = page.rect
        if rot in (90, 270):
            np_ = newdoc.new_page(width=r.height, height=r.width)
        else:
            np_ = newdoc.new_page(width=r.width, height=r.height)
        np_.insert_image(np_.rect, stream=buf.getvalue())
    newdoc.save(out, garbage=3, deflate=True)
    n = doc.page_count
    newdoc.close()
    doc.close()
    return {"pages": n, "corrected": corrected}
