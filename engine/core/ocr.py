"""OCR services: word-level OCR with confidence, auto-deskew, searchable-PDF
creation. Tesseract runs locally; nothing leaves the machine."""
from __future__ import annotations

import io
import subprocess
import tempfile
from dataclasses import dataclass
from typing import List, Optional, Tuple

import fitz
import numpy as np
from PIL import Image

from .tables import Word

LANG_MAP = {  # UI codes -> tesseract codes (same codes used by browser edition)
    "eng": "eng", "hin": "hin", "mar": "mar", "guj": "guj", "tam": "tam",
    "tel": "tel", "kan": "kan", "mal": "mal", "ben": "ben", "pan": "pan", "ori": "ori",
}


def _available_langs() -> set:
    try:
        out = subprocess.run(["tesseract", "--list-langs"], capture_output=True,
                             text=True, timeout=20).stdout
        return {l.strip() for l in out.splitlines()[1:] if l.strip()}
    except Exception:
        return {"eng"}


def resolve_langs(langs: str) -> str:
    avail = _available_langs()
    parts = [LANG_MAP.get(p.strip(), p.strip()) for p in (langs or "eng").split("+")]
    ok = [p for p in parts if p in avail]
    return "+".join(ok) if ok else "eng"


def render_page(doc: fitz.Document, page_no: int, dpi: int = 300) -> Image.Image:
    page = doc[page_no - 1]
    pix = page.get_pixmap(dpi=dpi)
    return Image.open(io.BytesIO(pix.tobytes("png")))


def deskew(img: Image.Image) -> Tuple[Image.Image, float]:
    """Estimate skew via OpenCV minAreaRect on text mask; rotate if > 0.4°."""
    try:
        import cv2
        g = np.array(img.convert("L"))
        inv = 255 - g
        thr = cv2.threshold(inv, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1]
        coords = np.column_stack(np.where(thr > 0))
        if len(coords) < 500:
            return img, 0.0
        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = 90 + angle
        if abs(angle) < 0.4 or abs(angle) > 15:
            return img, 0.0
        return img.rotate(angle, expand=True, fillcolor="white"), float(angle)
    except Exception:
        return img, 0.0


def fix_orientation(img: Image.Image) -> Tuple[Image.Image, int]:
    """Detect 90/180/270 rotation via Tesseract OSD and correct it."""
    try:
        import pytesseract
        osd = pytesseract.image_to_osd(img)
        import re as _re
        m = _re.search(r"Rotate: (\d+)", osd)
        rot = int(m.group(1)) if m else 0
        if rot in (90, 180, 270):
            return img.rotate(-rot, expand=True, fillcolor="white"), rot
    except Exception:
        pass
    return img, 0


def _words_reading_order(words: List[Word]) -> str:
    if not words:
        return ""
    ws = sorted(words, key=lambda w: (w.top, w.x0))
    rows, cur, cur_bottom = [], [], None
    for w in ws:
        h = max(2.0, w.bottom - w.top)
        if cur and w.top > cur_bottom - min(3.0, h * 0.25):
            rows.append(cur); cur = [w]; cur_bottom = w.bottom
        else:
            cur.append(w)
            cur_bottom = max(cur_bottom, w.bottom) if cur_bottom else w.bottom
    if cur:
        rows.append(cur)
    return "\n".join(" ".join(x.text for x in sorted(r, key=lambda x: x.x0)) for r in rows)


@dataclass
class OcrPage:
    words: List[Word]
    text: str
    mean_confidence: float
    skew_corrected: float


def ocr_page_words(doc: fitz.Document, page_no: int, langs: str = "eng",
                   dpi: int = 300) -> OcrPage:
    """OCR one page -> word boxes in PDF point coordinates + confidence."""
    import pytesseract

    img = render_page(doc, page_no, dpi)
    img, _rot = fix_orientation(img)
    img, skew = deskew(img)
    lang = resolve_langs(langs)
    data = pytesseract.image_to_data(img, lang=lang,
                                     output_type=pytesseract.Output.DICT)
    page = doc[page_no - 1]
    sx = page.rect.width / img.width
    sy = page.rect.height / img.height
    words: List[Word] = []
    confs: List[float] = []
    lines = {}
    n = len(data["text"])
    for i in range(n):
        t = (data["text"][i] or "").strip()
        conf = float(data["conf"][i]) if data["conf"][i] not in ("-1", -1) else -1
        if not t or conf < 25:  # drop garbage
            continue
        x, y, w, h = data["left"][i], data["top"][i], data["width"][i], data["height"][i]
        words.append(Word(x * sx, (x + w) * sx, y * sy, (y + h) * sy, t))
        if conf >= 0:
            confs.append(conf)
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        lines.setdefault(key, []).append(t)
    # reading-order text: cluster word boxes into visual rows (top-down, left-right)
    text = _words_reading_order(words)
    return OcrPage(words=words, text=text,
                   mean_confidence=round(sum(confs) / len(confs), 1) if confs else 0.0,
                   skew_corrected=round(skew, 2))


def make_searchable_pdf(src: str, out: str, langs: str = "eng", dpi: int = 300,
                        progress=None) -> dict:
    """Rebuild a scanned PDF with an invisible OCR text layer (via tesseract's
    pdf renderer per page, merged with PyMuPDF). Pages that already have text
    are copied through unchanged."""
    import pytesseract

    doc = fitz.open(src)
    outdoc = fitz.open()
    lang = resolve_langs(langs)
    confs = []
    for i in range(doc.page_count):
        page = doc[i]
        if len(page.get_text("text").strip()) >= 30:
            outdoc.insert_pdf(doc, from_page=i, to_page=i)
            continue
        img = render_page(doc, i + 1, dpi)
        img, _ = fix_orientation(img)
        img, _ = deskew(img)
        pdf_bytes = pytesseract.image_to_pdf_or_hocr(img, lang=lang, extension="pdf")
        pg = fitz.open("pdf", pdf_bytes)
        outdoc.insert_pdf(pg)
        pg.close()
        try:
            d = pytesseract.image_to_data(img, lang=lang, output_type=pytesseract.Output.DICT)
            cs = [float(c) for c, t in zip(d["conf"], d["text"])
                  if t and str(t).strip() and c not in ("-1", -1)]
            if cs:
                confs.append(sum(cs) / len(cs))
        except Exception:
            pass
        if progress:
            progress(i + 1, doc.page_count)
    outdoc.save(out, garbage=3, deflate=True)
    outdoc.close()
    n = doc.page_count
    doc.close()
    return {"pages": n, "mean_confidence": round(sum(confs) / len(confs), 1) if confs else None}
