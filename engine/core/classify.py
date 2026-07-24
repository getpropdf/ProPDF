"""Document classification engine.

Analyzes a PDF before conversion and decides the best processing pipeline.
Everything runs locally (PyMuPDF + pdfplumber page probes).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field, asdict
from typing import List, Optional

import fitz  # PyMuPDF


@dataclass
class PageProfile:
    number: int
    has_text: bool
    text_chars: int
    image_coverage: float          # 0..1 of page area covered by images
    rotation: int
    ruled_lines: int               # count of vector lines/rects (table hint)
    is_scanned: bool               # no usable text + dominated by an image
    width: float = 0.0
    height: float = 0.0


@dataclass
class DocProfile:
    pages: int
    encrypted: bool
    needed_password: bool
    damaged: bool
    repaired: bool
    has_forms: bool
    fonts_embedded: Optional[bool]
    any_scanned: bool
    all_scanned: bool
    needs_ocr: bool
    likely_tables: bool
    multi_column: bool
    doc_type: str                  # bank_statement / gstr / form26as / ...
    doc_type_label: str
    language_hint: str             # 'devanagari' / 'latin' / 'mixed'
    page_profiles: List[PageProfile] = field(default_factory=list)

    def to_dict(self):
        d = asdict(self)
        return d


# ---------- CA / financial document type detection ----------
_DOC_TYPES = [
    ("trial_balance", "Trial Balance", re.compile(r"trial balance", re.I)),
    ("balance_sheet", "Balance Sheet", re.compile(r"balance sheet", re.I)),
    ("profit_loss", "Profit & Loss Account", re.compile(r"profit\s*(and|&)\s*loss|statement of profit", re.I)),
    ("bank_statement", "Bank Statement", re.compile(
        r"statement of account|account statement|(?=.*\bifsc\b)(?=.*balance)|(?=.*(withdrawal|paid out))(?=.*(deposit|paid in))(?=.*balance)", re.I | re.S)),
    ("form26as", "Form 26AS", re.compile(r"form\s*26\s*as|annual tax statement", re.I)),
    ("ais", "Annual Information Statement (AIS)", re.compile(r"annual information statement", re.I)),
    ("gstr1", "GSTR-1", re.compile(r"gstr\s*-?\s*1\b", re.I)),
    ("gstr3b", "GSTR-3B", re.compile(r"gstr\s*-?\s*3b", re.I)),
    ("gstr2b", "GSTR-2B", re.compile(r"gstr\s*-?\s*2b", re.I)),
    ("gst_report", "GST Report", re.compile(r"\bgstin\b.*\btaxable\b|\bcgst\b.*\bsgst\b", re.I | re.S)),
    ("ledger", "Ledger", re.compile(r"\bledger\b", re.I)),
    ("tax_notice", "Income Tax Notice / Order", re.compile(r"income[- ]tax|assessment order|section\s+14[23]|e-proceeding", re.I)),
    ("tds", "TDS Report", re.compile(r"\btds\b.*\b(deducted|certificate|24q|26q)\b", re.I | re.S)),
    ("invoice", "Invoice", re.compile(r"tax invoice|invoice\s*(no|number|#)", re.I)),
    ("capital_gains", "Capital Gains Statement", re.compile(r"capital gain", re.I)),
    ("demat", "Demat / Broker Statement", re.compile(r"demat|holding statement|contract note", re.I)),
]


def detect_doc_type(text: str) -> tuple[str, str]:
    sample = text[:20000]
    for key, label, rx in _DOC_TYPES:
        if rx.search(sample):
            return key, label
    return "generic", "General Document"


def detect_language_hint(text: str) -> str:
    dev = len(re.findall(r"[ऀ-ॿ]", text))
    lat = len(re.findall(r"[A-Za-z]", text))
    if dev > 50 and lat > 50:
        return "mixed"
    if dev > lat:
        return "devanagari"
    return "latin"


def profile_pdf(path: str, password: str = "") -> DocProfile:
    damaged = False
    repaired = False
    try:
        doc = fitz.open(path)
    except Exception:
        # attempt repair-open via pikepdf
        import pikepdf
        import tempfile, os
        tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        tmp.close()
        with pikepdf.open(path, allow_overwriting_input=False) as pdf:
            pdf.save(tmp.name)
        doc = fitz.open(tmp.name)
        damaged = True
        repaired = True

    needed_password = False
    if doc.needs_pass:
        needed_password = True
        if not doc.authenticate(password or ""):
            doc.close()
            raise PermissionError("password required")

    pages: List[PageProfile] = []
    all_text = []
    lines_total = 0
    n = doc.page_count
    sample_idx = list(range(n)) if n <= 25 else sorted(set(
        list(range(8)) + list(range(n // 2 - 2, n // 2 + 2)) + list(range(n - 4, n))))

    for i in sample_idx:
        page = doc[i]
        text = page.get_text("text")
        all_text.append(text)
        area = abs(page.rect)
        img_area = 0.0
        try:
            for img in page.get_image_info():
                b = fitz.Rect(img["bbox"])
                img_area += abs(b & page.rect)
        except Exception:
            pass
        cov = min(1.0, img_area / area) if area else 0.0
        drawings = 0
        try:
            for d in page.get_drawings():
                for it in d["items"]:
                    if it[0] in ("l", "re"):
                        drawings += 1
        except Exception:
            pass
        lines_total += drawings
        chars = len(text.strip())
        scanned = chars < 30 and cov > 0.5
        pages.append(PageProfile(
            number=i + 1, has_text=chars >= 30, text_chars=chars,
            image_coverage=round(cov, 3), rotation=page.rotation,
            ruled_lines=drawings, is_scanned=scanned,
            width=page.rect.width, height=page.rect.height,
        ))

    text_joined = "\n".join(all_text)
    scanned_pages = [p for p in pages if p.is_scanned]
    has_forms = False
    try:
        has_forms = any(True for _ in doc[0].widgets()) if n else False
        if not has_forms:
            has_forms = bool(doc.is_form_pdf)
    except Exception:
        pass

    fonts_embedded = None
    try:
        fl = doc[0].get_fonts() if n else []
        if fl:
            fonts_embedded = all(f[3] != "" for f in fl) or None
    except Exception:
        pass

    # multi-column probe: wide horizontal gap in word x-distribution on text pages
    multi_col = False
    try:
        for i in sample_idx[:5]:
            page = doc[i]
            words = page.get_text("words")
            if len(words) < 40:
                continue
            xs = sorted((w[0] + w[2]) / 2 for w in words)
            mid_lo, mid_hi = page.rect.width * 0.40, page.rect.width * 0.60
            in_mid = sum(1 for x in xs if mid_lo < x < mid_hi)
            if in_mid < len(xs) * 0.04:
                multi_col = True
                break
    except Exception:
        pass

    key, label = detect_doc_type(text_joined)
    prof = DocProfile(
        pages=n,
        encrypted=needed_password,
        needed_password=needed_password,
        damaged=damaged,
        repaired=repaired,
        has_forms=has_forms,
        fonts_embedded=fonts_embedded,
        any_scanned=bool(scanned_pages),
        all_scanned=bool(pages) and all(p.is_scanned for p in pages),
        needs_ocr=bool(scanned_pages),
        likely_tables=lines_total >= 12 or key in (
            "bank_statement", "trial_balance", "ledger", "gst_report",
            "gstr1", "gstr3b", "gstr2b", "form26as", "tds"),
        multi_column=multi_col,
        doc_type=key,
        doc_type_label=label,
        language_hint=detect_language_hint(text_joined),
        page_profiles=pages,
    )
    doc.close()
    return prof
