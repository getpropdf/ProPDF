"""PDF -> Excel conversion orchestrator.

Pipeline: classify -> (auto-OCR scanned pages) -> candidate extraction in TWO
geometries (per-page best-engine AND document-global column geometry) ->
candidates judged by the hardest available metric (balance-continuity
confidence for statements, structural score otherwise) -> semantic
reconstruction -> formatted Excel + validation report.
"""
from __future__ import annotations

import gc
import os
from typing import Callable, List, Optional, Tuple

import fitz
import pdfplumber

from . import classify as C
from . import tables as T
from . import statements as S
from . import excel_out as X
from .ocr import ocr_page_words


def _concat(grids: List[T.Grid]) -> T.Grid:
    out: List[List[str]] = []
    width = max((len(r) for g in grids for r in g), default=0)
    for g in grids:
        for r in g:
            out.append(list(r) + [""] * (width - len(r)))
    return out


def convert_pdf_to_excel(src: str, out_path: str, langs: str = "eng",
                         one_sheet: bool = True, force_ocr: bool = False,
                         password: str = "",
                         progress: Optional[Callable] = None) -> dict:
    prof = C.profile_pdf(src, password=password)
    fz = fitz.open(src)
    if fz.needs_pass:
        fz.authenticate(password or "")
    try:
        pl = pdfplumber.open(src, password=password or None)
    except Exception:
        pl = None

    page_tables: List[T.PageTable] = []
    words_pages: List[List[T.Word]] = []
    ocr_pages = 0
    ocr_confs = []
    prof_by_page = {p.number: p for p in prof.page_profiles}

    for pno in range(1, fz.page_count + 1):
        if progress:
            progress(pno, fz.page_count, "extract")
        pp = prof_by_page.get(pno)
        scanned = force_ocr or (pp.is_scanned if pp else
                                len(fz[pno - 1].get_text("text").strip()) < 30)
        if scanned:
            op = ocr_page_words(fz, pno, langs=langs)
            ocr_pages += 1
            if op.mean_confidence:
                ocr_confs.append(op.mean_confidence)
            words = op.words
            pt = T.extract_page_tables(src, pno, pl, fz, ruled_hint=False,
                                       ocr_words=words, ocr_conf=op.mean_confidence)
        else:
            ruled = bool(pp and pp.ruled_lines >= 8)
            words = T.native_words(pl.pages[pno - 1]) if pl else []
            pt = T.extract_page_tables(src, pno, pl, fz, ruled_hint=ruled)
        words_pages.append(words)
        page_tables.append(pt)
        if pno % 25 == 0:
            gc.collect()

    page_tables = T.link_pages(page_tables)

    # ---------------- candidate geometries ----------------
    # (tag, combined grid, per-page grids for multi-sheet mode)
    candidates: List[Tuple[str, T.Grid, List[Tuple[str, T.Grid]]]] = []
    perpage_pages = [(f"Page {pt.page}", pt.grid) for pt in page_tables if pt.grid]
    candidates.append(("per-page", _concat([pt.grid for pt in page_tables if pt.grid]),
                       perpage_pages))
    if any(words_pages):
        for mg in (4.0, 7.0, 11.0):
            for tf in (0.08, 0.2):
                grids = T.global_stream_grids(words_pages, mg, thresh_frac=tf)
                named = [(f"Page {i+1}", g) for i, g in enumerate(grids) if g]
                linked = T.link_pages([T.PageTable(i + 1, g, f"global-{int(mg)}-{tf}", 0.0)
                                       for i, g in enumerate(grids)])
                candidates.append((f"global-{int(mg)}-{tf}",
                                   _concat([t.grid for t in linked if t.grid]), named))

    # ---------------- judge candidates ----------------
    best_st = None   # (tag, StatementResult)

    def consider(tag, st):
        nonlocal best_st
        key = (st.strict_confidence, st.confidence, len(st.rows))
        if best_st is None or key > (best_st[1].strict_confidence,
                                     best_st[1].confidence, len(best_st[1].rows)):
            best_st = (tag, st)

    # y-aware line candidates (primary statement path — one row per txn even
    # when narration lines sit above/below the dated line)
    if any(words_pages):
        for mg in (4.0, 7.0, 11.0):
            for tf in (0.08, 0.2):
                try:
                    pages_lines = T.global_stream_lines(words_pages, mg, thresh_frac=tf)
                    flat = [ln for pg in pages_lines for ln in pg]
                    if flat:
                        consider(f"lines-{int(mg)}-{tf}", S.reconstruct_lines(flat))
                except Exception:
                    pass
    # grid candidates as fallback
    for tag, comb, _ in candidates:
        if comb and S.is_bank_statement_grid(comb):
            try:
                consider(tag, S.reconstruct(comb))
            except Exception:
                pass

    best_generic = max(candidates,
                       key=lambda c: T.score_grid(c[1]) * (1 + 0.001 * len(c[1])))
    engines = sorted({pt.engine for pt in page_tables if pt.grid})

    result = {
        "doc_type": prof.doc_type,
        "doc_type_label": prof.doc_type_label,
        "pages": fz.page_count,
        "ocr_pages": ocr_pages,
        "mean_ocr_confidence": round(sum(ocr_confs) / len(ocr_confs), 1) if ocr_confs else None,
        "engines": engines,
        "mode": "generic",
        "rows": 0,
        "warnings": [],
    }

    if best_st is not None:
        tag, st = best_st
        X.write_statement(st, out_path, source_name=os.path.basename(src))
        result.update({
            "mode": "bank_statement",
            "geometry": tag,
            "rows": len(st.rows),
            "opening_balance": str(st.opening_balance) if st.opening_balance is not None else None,
            "closing_balance": str(st.closing_balance) if st.closing_balance is not None else None,
            "total_debits": str(st.total_debits),
            "total_credits": str(st.total_credits),
            "continuity_confidence": st.confidence,
            "continuity_failed_rows": st.bad_rows,
            "warnings": st.warnings,
        })
        fz.close()
        if pl:
            pl.close()
        return result

    tag, combined, named_pages = best_generic
    combined = T.stack_wrapped_headers(T.split_leading_date_columns(combined))
    named_pages = [(nm, T.stack_wrapped_headers(T.split_leading_date_columns(g)))
                   for nm, g in named_pages]
    meta = [
        "ProPDF Engine conversion report",
        f"Source: {os.path.basename(src)}",
        f"Detected document type: {prof.doc_type_label}",
        f"Pages: {fz.page_count}  |  OCR pages: {ocr_pages}",
        f"Column geometry: {tag}",
    ]
    if ocr_confs:
        mc = round(sum(ocr_confs) / len(ocr_confs), 1)
        meta.append(f"Mean OCR confidence: {mc}%")
        if mc < 80:
            meta.append("WARNING: low OCR confidence — verify numbers against the source.")
    meta.append("Extraction engines used: " + (", ".join(engines) or "none"))

    result["rows"] = len(combined)
    result["geometry"] = tag
    if one_sheet:
        X.write_generic([("Data", combined)], out_path, one_sheet=True, meta_lines=meta)
    else:
        X.write_generic(named_pages or [("Data", combined)], out_path,
                        one_sheet=False, meta_lines=meta)
    if not combined:
        result["warnings"].append("No table content could be extracted.")
    fz.close()
    if pl:
        pl.close()
    return result
