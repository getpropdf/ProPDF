"""CA-office document intelligence — bank statement reconstruction.

v13.0 pipeline (built against a real Axis statement + PDF24's output as the
quality benchmark):
- header row found ANYWHERE in the document (real statements have long
  account-info preambles before the table),
- header mapping via synonyms, then VERIFIED AND REPAIRED from column content,
- Y-AWARE TRANSACTION GROUPING: a transaction anchor is a line whose date
  column parses as a date; every other line attaches to its NEAREST anchor by
  vertical distance. This handles narration lines printed ABOVE the dated line
  (Axis style) as well as below (HDFC style) — one clean row per transaction,
- unmapped columns with content are preserved as extra columns (fidelity),
- the account-info preamble is kept and written above the table,
- BALANCE CONTINUITY VALIDATION: prev − Dr + Cr = balance for every row.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Dict, List, Optional, Sequence, Tuple

from .numparse import parse_number, parse_date, is_number, is_date

Line = Tuple[float, List[str]]   # (y, cells)

_HDR_SYNONYMS = {
    "date": [r"^(txn|tran(saction)?|post(ing)?)?\s*\.?\s*date$", r"^date$", r"tran\s*date"],
    "value_date": [r"value\s*date", r"^val\.?\s*dt\.?$"],
    "particulars": [r"particulars?", r"narration", r"description", r"details",
                    r"transaction\s*(details|remarks)", r"remarks"],
    "ref": [r"(cheque|chq|cheq)\.?\s*(no|num|#)?", r"ref(erence)?\.?\s*(no|num|#)?",
            r"utr", r"instrument"],
    "debit": [r"withdrawal(\s*\(?dr\.?\)?)?(\s*(amt|amount))?", r"debits?(\s*amount)?",
              r"^dr\.?$", r"paid\s*out", r"withdrawals?"],
    "credit": [r"deposits?(\s*\(?cr\.?\)?)?(\s*(amt|amount))?", r"credits?(\s*amount)?",
               r"^cr\.?$", r"paid\s*in"],
    "balance": [r"(closing\s*|running\s*)?balance", r"^bal\.?$"],
}

_SKIP_RE = re.compile(
    r"closing\s*balance|balance\s*c/?f|carried\s*forward|^total\b|grand\s*total|"
    r"statement\s*summary|page\s*\d+\s*(of|/)|computer\s*generated|"
    r"transaction\s*total|legends?\b|end\s*of\s*statement", re.I)
_OPEN_RE = re.compile(r"opening\s*balance|balance\s*b/?f|brought\s*forward", re.I)


@dataclass
class StatementResult:
    headers: List[str]
    rows: List[Dict]
    opening_balance: Optional[Decimal]
    closing_balance: Optional[Decimal]
    total_debits: Decimal
    total_credits: Decimal
    continuity_ok: int
    continuity_bad: int
    bad_rows: List[int] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    preamble: List[str] = field(default_factory=list)
    extra_headers: List[str] = field(default_factory=list)

    @property
    def confidence(self) -> float:
        n = self.continuity_ok + self.continuity_bad
        return round(100.0 * self.continuity_ok / n, 1) if n else 0.0

    @property
    def strict_confidence(self) -> float:
        return round(100.0 * self.continuity_ok / len(self.rows), 1) if self.rows else 0.0


def _match_headers(header_row: Sequence[str]) -> Optional[Dict[int, str]]:
    mapping: Dict[int, str] = {}
    used = set()
    for idx, cell in enumerate(header_row):
        c = re.sub(r"\s+", " ", str(cell)).strip().lower()
        if not c:
            continue
        for canon, pats in _HDR_SYNONYMS.items():
            if canon in used:
                continue
            if any(re.search(p, c) for p in pats):
                mapping[idx] = canon
                used.add(canon)
                break
    if len(mapping) >= 3 and ("debit" in used or "credit" in used) and "balance" in used:
        return mapping
    return None


def find_header(grid: Sequence[Sequence[str]]) -> Optional[tuple]:
    """Scan the WHOLE grid — real statements have long preambles."""
    for i, row in enumerate(grid):
        m = _match_headers(row)
        if m:
            return i, m
    return None


def is_bank_statement_grid(grid) -> bool:
    return find_header(grid) is not None


def _column_content_kinds(body: Sequence[Sequence[str]], ncols: int):
    kinds = []
    for j in range(ncols):
        vals = [str(r[j]).strip() for r in body if j < len(r) and str(r[j]).strip()]
        n = len(vals)
        if n == 0:
            kinds.append(("empty", 0))
            continue
        nd = sum(1 for v in vals if is_date(v))
        nn = sum(1 for v in vals if is_number(v))
        if nd / n >= 0.6:
            kinds.append(("date", n))
        elif nn / n >= 0.6:
            kinds.append(("amount", n))
        else:
            kinds.append(("text", n))
    return kinds


def repair_mapping(body, ncols: int, mapping: Dict[int, str]) -> Dict[int, str]:
    kinds = _column_content_kinds(body, ncols)
    used = set(mapping.values())
    for idx, canon in list(mapping.items()):
        k = kinds[idx][0] if idx < len(kinds) else "empty"
        if canon in ("debit", "credit", "balance") and k == "date":
            del mapping[idx]; used.discard(canon)
        elif canon in ("date", "value_date") and k == "amount":
            del mapping[idx]; used.discard(canon)
    date_cols = [j for j in range(ncols) if kinds[j][0] == "date" and j not in mapping]
    if "date" not in used and date_cols:
        mapping[date_cols.pop(0)] = "date"; used.add("date")
    if "value_date" not in used and date_cols:
        mapping[date_cols.pop(0)] = "value_date"; used.add("value_date")
    amount_cols = [j for j in range(ncols) if kinds[j][0] == "amount" and j not in mapping]
    if "balance" not in used and amount_cols:
        mapping[amount_cols.pop()] = "balance"; used.add("balance")
    if "debit" not in used and amount_cols:
        mapping[amount_cols.pop(0)] = "debit"; used.add("debit")
    if "credit" not in used and amount_cols:
        mapping[amount_cols.pop(0)] = "credit"; used.add("credit")
    if "particulars" not in used:
        best, best_n = -1, -1
        for j in range(ncols):
            if kinds[j][0] == "text" and j not in mapping and kinds[j][1] > best_n:
                best, best_n = j, kinds[j][1]
        if best >= 0:
            mapping[best] = "particulars"; used.add("particulars")
    return mapping




def _lead_date(s: str):
    """Parse a date from a cell even when other data bled into it.
    Returns (parsed_date_or_None, remainder_text)."""
    s = (s or "").strip()
    if not s:
        return None, ""
    d = parse_date(s)
    if d is not None:
        return d, ""
    parts = s.split()
    if parts:
        d = parse_date(parts[0])
        if d is not None:
            return d, " ".join(parts[1:])
    return None, s


def reconstruct_lines(lines: Sequence[Line]) -> StatementResult:
    grid = [c for _, c in lines]
    fh = find_header(grid)
    if not fh:
        raise ValueError("no bank-statement header found")
    hi, mapping = fh
    ncols = max(len(c) for c in grid)
    body_cells = grid[hi + 1:]
    mapping = repair_mapping(body_cells, ncols, dict(mapping))
    inv = {v: k for k, v in mapping.items()}
    header_cells = grid[hi]
    extra_cols = [j for j in range(ncols) if j not in mapping
                  and any(j < len(r) and str(r[j]).strip() for r in body_cells)]
    extra_headers = [(str(header_cells[j]).strip() if j < len(header_cells)
                      and str(header_cells[j]).strip() else f"Col {j+1}") for j in extra_cols]

    preamble = []
    for _, cells in lines[:hi]:
        txt = "  ".join(c for c in (str(x).strip() for x in cells) if c)
        if txt:
            preamble.append(txt)

    def cell(cells, canon):
        idx = inv.get(canon)
        return str(cells[idx]).strip() if idx is not None and idx < len(cells) else ""

    warnings: List[str] = []
    opening: Optional[Decimal] = None
    work: List[Line] = []
    for y, cells in lines[hi + 1:]:
        joined = " ".join(str(c) for c in cells).strip()
        if not joined:
            continue
        low = joined.lower()
        if _OPEN_RE.search(low):
            for c in reversed(cells):
                v = parse_number(c)
                if v is not None:
                    opening = v
                    break
            continue
        if _SKIP_RE.search(low):
            continue
        if _match_headers(cells):   # repeated header on later pages
            continue
        work.append((y, cells))

    # ---- y-aware transaction grouping ----
    anchors = [i for i, (y, cells) in enumerate(work)
               if _lead_date(cell(cells, "date"))[0] is not None]
    if not anchors:
        raise ValueError("no dated transaction lines found")
    groups: Dict[int, List[int]] = {a: [a] for a in anchors}
    ay = [work[a][0] for a in anchors]
    for i, (y, cells) in enumerate(work):
        if i in groups:
            continue
        # nearest anchor by vertical distance
        best, best_d = None, None
        for k, a in enumerate(anchors):
            d = abs(y - ay[k])
            if best_d is None or d < best_d:
                best, best_d = a, d
        if best is not None:
            groups[best].append(i)

    rows: List[Dict] = []
    for a in anchors:
        members = sorted(groups[a], key=lambda i: work[i][0])
        acells = work[a][1]

        def first_num(canon):
            v = parse_number(cell(acells, canon))
            if v is not None:
                return v
            for i in members:
                if i == a:
                    continue
                v = parse_number(cell(work[i][1], canon))
                if v is not None:
                    return v
            return None

        def joined_text(canon):
            parts = []
            for i in members:
                t = cell(work[i][1], canon)
                if t:
                    parts.append(t)
            return " ".join(parts).strip()

        extras = []
        for j in extra_cols:
            parts = []
            for i in members:
                c2 = work[i][1]
                t = str(c2[j]).strip() if j < len(c2) else ""
                if t:
                    parts.append(t)
            extras.append(" ".join(parts).strip())

        vd = cell(acells, "value_date")
        lead, date_rest = _lead_date(cell(acells, "date"))
        ref_txt = joined_text("ref")
        if date_rest:
            ref_txt = (date_rest + " " + ref_txt).strip()
        rows.append({
            "date": lead or cell(acells, "date"),
            "value_date": parse_date(vd) or vd,
            "particulars": joined_text("particulars"),
            "ref": ref_txt,
            "debit": first_num("debit"),
            "credit": first_num("credit"),
            "balance": first_num("balance"),
            "extras": extras,
        })

    # ---- balance continuity ----
    ok = bad = missing_bal = 0
    bad_rows: List[int] = []
    prev = opening
    for i, r in enumerate(rows):
        if r["balance"] is None:
            missing_bal += 1
            bad_rows.append(i + 1)
            continue
        if prev is not None:
            expect = prev - (r["debit"] or Decimal(0)) + (r["credit"] or Decimal(0))
            if abs(expect - r["balance"]) <= Decimal("0.01"):
                ok += 1
            else:
                bad += 1
                bad_rows.append(i + 1)
        prev = r["balance"]

    tot_deb = sum((r["debit"] or Decimal(0)) for r in rows)
    tot_cre = sum((r["credit"] or Decimal(0)) for r in rows)
    closing = next((r["balance"] for r in reversed(rows) if r["balance"] is not None), None)
    if opening is None and rows:
        warnings.append("Opening balance row not found — continuity checked from the first transaction.")
    if missing_bal:
        warnings.append(f"{missing_bal} row(s) have no readable balance — flagged for review.")
    if bad:
        warnings.append(f"{bad} row(s) failed balance continuity — flagged in the Validation sheet. "
                        "Verify these against the source PDF.")
    return StatementResult(
        headers=["Date", "Value Date", "Particulars", "Ref / Cheque No",
                 "Withdrawal (Dr)", "Deposit (Cr)", "Balance"],
        rows=rows, opening_balance=opening, closing_balance=closing,
        total_debits=Decimal(tot_deb), total_credits=Decimal(tot_cre),
        continuity_ok=ok, continuity_bad=bad, bad_rows=bad_rows, warnings=warnings,
        preamble=preamble, extra_headers=extra_headers,
    )


def reconstruct(grid: Sequence[Sequence[str]]) -> StatementResult:
    """Grid-only entry point (no y info): synthesize uniform line spacing."""
    return reconstruct_lines([(float(i) * 10.0, list(r)) for i, r in enumerate(grid)])
