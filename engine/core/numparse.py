"""Numeric / date parsing tuned for Indian financial documents.

Handles: Indian digit grouping (1,04,578.25), western grouping, bracket
negatives (1,234.00), trailing Cr/Dr markers, currency symbols, dashes-as-nil,
and common Indian date formats.
"""
from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Optional, Tuple

_CURRENCY = re.compile(r"[₹$€£]|Rs\.?\s*|INR\s*", re.I)
_NIL = {"", "-", "--", "—", "–", "nil", "na", "n.a.", "n/a", ".", "0.00*"}

# strict money pattern: digits with optional grouping and optional decimals
_MONEY_RE = re.compile(
    r"^\(?\s*-?\s*(?:\d{1,3}(?:[,\s]\d{2,3})*|\d+)(?:\.\d{1,4})?\s*\)?\s*(?:cr|dr)?\.?$",
    re.I,
)

_DATE_PATTERNS = [
    ("%d/%m/%Y", re.compile(r"^\d{1,2}/\d{1,2}/\d{4}$")),
    ("%d-%m-%Y", re.compile(r"^\d{1,2}-\d{1,2}-\d{4}$")),
    ("%d/%m/%y", re.compile(r"^\d{1,2}/\d{1,2}/\d{2}$")),
    ("%d-%m-%y", re.compile(r"^\d{1,2}-\d{1,2}-\d{2}$")),
    ("%d-%b-%Y", re.compile(r"^\d{1,2}-[A-Za-z]{3}-\d{4}$")),
    ("%d %b %Y", re.compile(r"^\d{1,2} [A-Za-z]{3} \d{4}$")),
    ("%d-%b-%y", re.compile(r"^\d{1,2}-[A-Za-z]{3}-\d{2}$")),
    ("%d.%m.%Y", re.compile(r"^\d{1,2}\.\d{1,2}\.\d{4}$")),
    ("%Y-%m-%d", re.compile(r"^\d{4}-\d{1,2}-\d{1,2}$")),
    ("%d %B %Y", re.compile(r"^\d{1,2} [A-Za-z]{4,9} \d{4}$")),
]


def parse_number(raw: str) -> Optional[Decimal]:
    """Parse a financial number. Returns Decimal or None if not numeric."""
    if raw is None:
        return None
    s = str(raw).strip()
    if s.lower() in _NIL:
        return None
    s = _CURRENCY.sub("", s).strip()
    if not s or not _MONEY_RE.match(s):
        return None
    neg = False
    low = s.lower()
    if low.endswith("dr") or low.endswith("dr."):
        # Dr on a balance = negative by bank convention only when marked; keep sign
        s = re.sub(r"\s*dr\.?$", "", s, flags=re.I)
        neg = True
    elif low.endswith("cr") or low.endswith("cr."):
        s = re.sub(r"\s*cr\.?$", "", s, flags=re.I)
    if s.startswith("(") and s.endswith(")"):
        neg = True
        s = s[1:-1]
    s = s.replace(",", "").replace(" ", "").strip()
    if s.startswith("-"):
        neg = not neg if s.count("-") % 2 else neg
        s = s.lstrip("-")
    if not s:
        return None
    try:
        d = Decimal(s)
    except InvalidOperation:
        return None
    return -d if neg else d


def is_number(raw: str) -> bool:
    return parse_number(raw) is not None


def parse_date(raw: str) -> Optional[datetime]:
    if raw is None:
        return None
    s = str(raw).strip()
    if not s or len(s) > 20:
        return None
    for fmt, rx in _DATE_PATTERNS:
        if rx.match(s):
            try:
                return datetime.strptime(s, fmt)
            except ValueError:
                continue
    return None


def is_date(raw: str) -> bool:
    return parse_date(raw) is not None


def classify_cell(raw: str) -> Tuple[str, object]:
    """Return (kind, value) where kind in {'number','date','text','empty'}."""
    s = ("" if raw is None else str(raw)).strip()
    if not s:
        return "empty", ""
    d = parse_date(s)
    if d is not None:
        return "date", d
    n = parse_number(s)
    if n is not None:
        return "number", n
    return "text", s


def indian_format(n: Decimal) -> str:
    """Format Decimal with Indian digit grouping (for messages only)."""
    neg = n < 0
    n = abs(n)
    whole, _, frac = f"{n:.2f}".partition(".")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        whole = ",".join(parts) + "," + tail
    out = f"{whole}.{frac}"
    return ("-" + out) if neg else out
