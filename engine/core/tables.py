"""Table reconstruction pipeline (flagship).

Stages: word extraction (native or OCR) -> candidate table extraction with
multiple engines (pdfplumber lines / pdfplumber text / PyMuPDF / custom
whitespace-stream) -> candidate scoring -> best grid per page ->
multi-page table linking -> semantic post-processing (statements.py).

v11.1: adds GLOBAL column geometry — for multi-page documents (bank
statements etc.) column separators are derived from ALL pages jointly, so
page 2+ can never drift into different columns than page 1 (the exact bug a
real statement exposed: later pages without a header row and with an empty
Value-Date column produced misaligned rows).
"""
from __future__ import annotations

import statistics
from dataclasses import dataclass
from typing import List, Optional, Sequence

import fitz
import pdfplumber

from .numparse import is_number, is_date

Grid = List[List[str]]


@dataclass
class PageTable:
    page: int
    grid: Grid
    engine: str
    score: float
    ocr: bool = False
    ocr_confidence: Optional[float] = None


@dataclass
class Word:
    x0: float
    x1: float
    top: float
    bottom: float
    text: str


# --------------------------------------------------------------------------
# cleaning & scoring
# --------------------------------------------------------------------------

def _clean(grid: Grid, drop_empty_cols: bool = True) -> Grid:
    out = []
    for row in grid or []:
        cells = ["" if c is None else str(c).replace("\n", " ").strip() for c in row]
        if any(cells):
            out.append(cells)
    if out:
        ncol = max(len(r) for r in out)
        for r in out:
            r.extend([""] * (ncol - len(r)))
        if drop_empty_cols:
            keep = [j for j in range(ncol) if any(r[j] for r in out)]
            out = [[r[j] for j in keep] for r in out]
    return out


_NUMTOK = None


def _num_tokens(cell: str) -> int:
    global _NUMTOK
    if _NUMTOK is None:
        import re as _re
        _NUMTOK = _re.compile(r"(?<![\d,.])\d{1,3}(?:,\d{2,3})*\.\d{2,4}(?![\d])|(?<![\d,.])\d+\.\d{2,4}(?![\d])")
    return len(_NUMTOK.findall(cell or ""))


def score_grid(grid: Grid) -> float:
    """Quality heuristic for a candidate grid. Rewards separated, coherent
    numeric/date columns; punishes under-splitting (several numbers jammed
    into one cell — the classic symptom of missed column boundaries)."""
    grid = _clean(grid)
    if not grid or len(grid) < 2:
        return 0.0
    ncols = max(len(r) for r in grid)
    if ncols < 2:
        return 1.0
    cells = [c for r in grid for c in r]
    filled = [c for c in cells if c]
    fill_ratio = len(filled) / max(1, len(cells))
    coherent = 0
    for j in range(ncols):
        col = [r[j] for r in grid if j < len(r) and r[j]]
        if len(col) < 2:
            continue
        num = sum(1 for c in col if is_number(c))
        dat = sum(1 for c in col if is_date(c))
        if num / len(col) >= 0.6 or dat / len(col) >= 0.6:
            coherent += 1
    undersplit = sum(1 for c in filled if _num_tokens(c) >= 2) / max(1, len(filled))
    data_rows = sum(1 for r in grid if any(is_number(c) for c in r))
    return round(10.0 * coherent + 1.5 * ncols + min(15.0, data_rows / 5.0)
                 + 8.0 * fill_ratio - 35.0 * undersplit, 2)


# --------------------------------------------------------------------------
# whitespace-stream engine primitives (shared by per-page and global modes)
# --------------------------------------------------------------------------

def cluster_rows(words: Sequence[Word]) -> List[List[Word]]:
    """Cluster words into visual rows by vertical position."""
    if not words:
        return []
    ws = sorted(words, key=lambda w: (w.top, w.x0))
    rows: List[List[Word]] = []
    cur: List[Word] = []
    cur_bottom = None
    for w in ws:
        h = max(2.0, w.bottom - w.top)
        if cur and w.top > cur_bottom - min(3.0, h * 0.25):
            rows.append(cur)
            cur = [w]
            cur_bottom = w.bottom
        else:
            cur.append(w)
            cur_bottom = max(cur_bottom, w.bottom) if cur_bottom else w.bottom
    if cur:
        rows.append(cur)
    return rows


def find_bounds(rows_basis: List[List[Word]], min_gap: float, res: float = 2.0,
                thresh_frac: float = 0.08):
    """Column separators from a whitespace-coverage histogram over the given
    rows. Returns list of separator x positions (may be empty)."""
    all_words = [w for r in rows_basis for w in r]
    if not all_words:
        return []
    min_x = min(w.x0 for w in all_words)
    max_x = max(w.x1 for w in all_words)
    nb = int(max_x // res) + 2
    covered = [0] * (nb + 1)

    def _gaps(r):
        ws = sorted(r, key=lambda w: w.x0)
        g = 0
        for a, b in zip(ws, ws[1:]):
            if b.x0 - a.x1 >= max(min_gap, 6.0):
                g += 1
        return g

    tabular = [r for r in rows_basis if _gaps(r) >= 2]
    if len(tabular) >= 3:
        basis = tabular
    else:
        multi = [r for r in rows_basis if len(r) > 1]
        basis = multi if len(multi) >= 2 else rows_basis
    for r in basis:
        for w in r:
            b0 = max(0, int(w.x0 // res))
            b1 = min(nb, int(w.x1 // res))
            for b in range(b0, b1 + 1):
                covered[b] += 1
    thresh = max(1, int(len(basis) * thresh_frac))
    seps: List[float] = []
    in_gap = False
    gap_start = 0
    for b in range(int(min_x // res), int(max_x // res) + 1):
        if covered[b] <= thresh:
            if not in_gap:
                in_gap = True
                gap_start = b
        else:
            if in_gap and (b - gap_start) * res >= min_gap:
                seps.append(((gap_start + b) / 2) * res)
            in_gap = False
    return seps


def apply_bounds(rows: List[List[Word]], seps: List[float],
                 min_gap: Optional[float] = None) -> Grid:
    if not seps:
        return [[" ".join(w.text for w in sorted(r, key=lambda x: x.x0))] for r in rows]
    bounds = [-1e9] + list(seps) + [1e9]

    def band_of(x):
        for j in range(len(bounds) - 1):
            if bounds[j] <= x < bounds[j + 1]:
                return j
        return len(bounds) - 2

    grid: Grid = []
    for r in rows:
        ws = sorted(r, key=lambda x: x.x0)
        # prose row: contiguous text with no real column gap -> keep whole in
        # its first band (titles, addresses, section names stay intact)
        if min_gap is not None and len(ws) > 1:
            biggest = max(b.x0 - a.x1 for a, b in zip(ws, ws[1:]))
            if biggest < max(min_gap, 6.0):
                cells = ["" for _ in range(len(bounds) - 1)]
                cells[band_of((ws[0].x0 + ws[0].x1) / 2)] = " ".join(w.text for w in ws)
                grid.append(cells)
                continue
        cells = ["" for _ in range(len(bounds) - 1)]
        for w in ws:
            j = band_of((w.x0 + w.x1) / 2)
            cells[j] = (cells[j] + " " + w.text).strip()
        grid.append(cells)
    return grid


def words_to_grid(words: Sequence[Word], page_width: float, min_gap: float = 6.0) -> Grid:
    rows = cluster_rows(words)
    if len(rows) < 2:
        return [[" ".join(w.text for w in sorted(r, key=lambda x: x.x0))] for r in rows]
    seps = find_bounds(rows, min_gap)
    return apply_bounds(rows, seps, min_gap)


def global_stream_grids(words_pages: List[Sequence[Word]], min_gap: float,
                        thresh_frac: float = 0.08) -> List[Grid]:
    """One shared column geometry for the whole document: separators are
    computed from the union of all pages' rows, then applied to every page.
    Empty columns are NOT dropped per page, so page grids always align."""
    rows_pages = [cluster_rows(w) for w in words_pages]
    basis = [r for rows in rows_pages for r in rows]
    seps = find_bounds(basis, min_gap, thresh_frac=thresh_frac)
    return [_clean(apply_bounds(rows, seps, min_gap), drop_empty_cols=False)
            for rows in rows_pages]


# --------------------------------------------------------------------------
# other engines
# --------------------------------------------------------------------------

def _pdfplumber_tables(pl_page, strategy: str) -> List[Grid]:
    kw = {
        "lines": dict(vertical_strategy="lines", horizontal_strategy="lines",
                      snap_tolerance=4, join_tolerance=4),
        "text": dict(vertical_strategy="text", horizontal_strategy="text",
                     text_tolerance=3, intersection_tolerance=5),
    }[strategy]
    try:
        return [t.extract() for t in pl_page.find_tables(table_settings=kw)]
    except Exception:
        return []


def _pymupdf_tables(page: fitz.Page) -> List[Grid]:
    try:
        tf = page.find_tables()
        return [t.extract() for t in tf.tables]
    except Exception:
        return []


def native_words(pl_page) -> List[Word]:
    try:
        return [Word(w["x0"], w["x1"], w["top"], w["bottom"], w["text"])
                for w in pl_page.extract_words(keep_blank_chars=False)]
    except Exception:
        return []


# --------------------------------------------------------------------------
# per-page orchestration
# --------------------------------------------------------------------------

def extract_page_tables(pdf_path: str, page_no: int, pl_pdf, fz_doc,
                        ruled_hint: bool, ocr_words: Optional[List[Word]] = None,
                        ocr_conf: Optional[float] = None) -> PageTable:
    """Return the best grid for one page (1-based page_no)."""
    candidates: List[PageTable] = []

    if ocr_words is not None:
        pw = fz_doc[page_no - 1].rect.width
        for mg in (4.0, 7.0, 11.0):
            g = words_to_grid(ocr_words, pw, min_gap=mg)
            candidates.append(PageTable(page_no, _clean(g), f"ocr-stream-{int(mg)}",
                                        score_grid(g), ocr=True, ocr_confidence=ocr_conf))
    else:
        pl_page = pl_pdf.pages[page_no - 1]
        fz_page = fz_doc[page_no - 1]
        strategies = (["lines", "text"] if ruled_hint else ["text", "lines"])
        for s in strategies:
            for g in _pdfplumber_tables(pl_page, s):
                candidates.append(PageTable(page_no, _clean(g), f"pdfplumber-{s}", score_grid(g)))
        for g in _pymupdf_tables(fz_page):
            candidates.append(PageTable(page_no, _clean(g), "pymupdf", score_grid(g)))
        words = native_words(pl_page)
        for mg in (4.0, 7.0, 11.0):
            g = words_to_grid(words, pl_page.width, min_gap=mg)
            candidates.append(PageTable(page_no, _clean(g), f"stream-{int(mg)}",
                                        score_grid(g)))
        # free pdfplumber per-page caches (vital for 100+ page files)
        try:
            pl_page.flush_cache()
            pl_page.get_textmap.cache_clear()
        except Exception:
            pass

    candidates = [c for c in candidates if c.grid]
    if not candidates:
        return PageTable(page_no, [], "none", 0.0)
    best = max(candidates, key=lambda c: c.score)

    # ruled-table engines can silently drop rows outside the detected bbox;
    # if the stream engine found substantially more rows at similar score, prefer it
    stream = max((c for c in candidates if c.engine.startswith("stream")),
                 key=lambda c: c.score, default=None)
    if stream and best.engine.startswith(("pdfplumber", "pymupdf")):
        if len(stream.grid) > len(best.grid) * 1.4 and stream.score >= best.score * 0.8:
            best = stream
    return best


# --------------------------------------------------------------------------
# multi-page table linking
# --------------------------------------------------------------------------
def _row_sig(row: List[str]) -> str:
    return "|".join(c.strip().lower() for c in row)


def link_pages(tables: List[PageTable]) -> List[PageTable]:
    """Merge continuation pages: drop repeated header rows on later pages."""
    if not tables:
        return tables
    header_sigs = set()
    first = next((t for t in tables if t.grid), None)
    if first:
        for row in first.grid[:3]:
            nonempty = [c for c in row if c]
            if len(nonempty) >= 2 and not any(is_number(c) for c in nonempty):
                header_sigs.add(_row_sig(row))
    for t in tables[1:] if first else []:
        if not t.grid:
            continue
        while t.grid and _row_sig(t.grid[0]) in header_sigs:
            t.grid = t.grid[1:]
        if t.grid and header_sigs:
            row0 = [c.strip().lower() for c in t.grid[0]]
            for sig in header_sigs:
                hdr = sig.split("|")
                same = sum(1 for a, b in zip(row0, hdr) if a and a == b)
                if same >= max(2, int(0.6 * len(hdr))):
                    t.grid = t.grid[1:]
                    break
    return tables



def global_stream_lines(words_pages: List[Sequence[Word]], min_gap: float,
                        thresh_frac: float = 0.08):
    """Like global_stream_grids but returns y-aware lines: per page, a list of
    (y, cells) with a shared document-wide column geometry. Page offsets keep
    y monotonically increasing so nearest-anchor grouping works everywhere."""
    rows_pages = [cluster_rows(w) for w in words_pages]
    basis = [r for rows in rows_pages for r in rows]
    seps = find_bounds(basis, min_gap, thresh_frac=thresh_frac)
    out = []
    offset = 0.0
    for rows in rows_pages:
        page_lines = []
        for r in rows:
            y = min(w.top for w in r) + offset
            cells = apply_bounds([r], seps, min_gap)[0]
            if any(str(c).strip() for c in cells):
                page_lines.append((y, [str(c).strip() for c in cells]))
        offset += 1000.0
        out.append(page_lines)
    return out


def stack_wrapped_headers(grid: Grid) -> Grid:
    """Merge a wrapped header line into the line above (e.g. 'Balance/Stamp/TDS'
    + 'Units/Duty/Amount' -> 'Balance Units' ...). Only merges consecutive
    text-only rows where the lower row's filled cells (>=2) all sit under
    filled cells of the upper row."""
    from .numparse import is_number as _isn, is_date as _isd

    def numericish(row):
        return any(_isn(c) or _isd(c) for c in row if c)

    out: Grid = []
    i = 0
    while i < len(grid):
        row = list(grid[i])
        if (i + 1 < len(grid) and not numericish(row) and not numericish(grid[i + 1])):
            nxt = grid[i + 1]
            filled_next = [j for j, c in enumerate(nxt) if str(c).strip()]
            filled_cur = {j for j, c in enumerate(row) if str(c).strip()}
            if len(filled_next) >= 2 and all(j in filled_cur for j in filled_next):
                for j in filled_next:
                    row[j] = (str(row[j]) + " " + str(nxt[j])).strip()
                i += 2
                out.append(row)
                continue
        out.append(row)
        i += 1
    return out


def split_leading_date_columns(grid: Grid) -> Grid:
    """If a column's cells are mostly 'DATE  more text' (date and the next
    field merged because their gap is narrower than the column threshold —
    e.g. Date + Transaction Nature), split the leading date into its own
    column. Matches how good converters keep Date separate."""
    import re as _re
    if not grid:
        return grid
    date_rx = _re.compile(r"^(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}[\-\s][A-Za-z]{3,9}[\-\s]\d{2,4})\s+(\S.*)$")
    ncols = max(len(r) for r in grid)
    changed = False
    for j in range(ncols):
        cells = [r[j] for r in grid if j < len(r) and str(r[j]).strip()]
        if len(cells) < 3:
            continue
        matched = [date_rx.match(str(c).strip()) for c in cells]
        hits = [m for m in matched if m]
        if len(hits) < 6 and len(hits) / len(cells) < 0.5:
            continue
        # remainder must be mostly NON-numeric (a real 2nd field like a
        # narration), else we'd wrongly split a date+amount column
        rem_numeric = sum(1 for m in hits if is_number(m.group(2)))
        if rem_numeric > len(hits) * 0.4:
            continue
        # only split if the remainder is usually NON-numeric (real 2nd field),
        # not a date accidentally glued to an amount
        new_grid = []
        for r in grid:
            r = list(r) + [""] * (ncols - len(r))
            m = date_rx.match(str(r[j]).strip())
            if m:
                r = r[:j] + [m.group(1), m.group(2)] + r[j + 1:]
            else:
                cell = str(r[j]).strip()
                filled = sum(1 for c in r if str(c).strip())
                parts = cell.split(None, 1)
                # header row (3+ filled cells): split its merged label too, so
                # 'Date Transaction Nature' -> 'Date' | 'Transaction Nature'
                if filled >= 3 and len(parts) == 2:
                    r = r[:j] + [parts[0], parts[1]] + r[j + 1:]
                else:
                    r = r[:j] + [r[j], ""] + r[j + 1:]
            new_grid.append(r)
        grid = new_grid
        ncols += 1
        changed = True
        break  # one split per call; re-run if needed
    if changed:
        return split_leading_date_columns(grid)
    return grid
