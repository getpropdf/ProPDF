# Changelog

## v14.0 — Every table to PDF24 quality, not just statements (July 2026)

Tested against a real mutual-fund capital-gains statement (JSP Wealth /
CAMS-style) and PDF24's conversion of the same file. Earlier versions nailed
bank statements but dumped this into 2 messy columns; now it produces the same
clean 10-column table PDF24 does — Date, Transaction Nature, Amount, Price,
Units, Balance Units, Stamp Duty, TDS Amount, STT, Total Amount — with every
value in the right cell.

**Rebuilt the generic-table path (any PDF, any layout):**
- Column detection now uses only genuinely tabular rows, so address blocks,
  titles and footers can't distort the column grid (the exact cause of the
  2-column mess).
- A rewritten scorer rewards clean, separated numeric/date columns and
  penalises "several numbers jammed in one cell", so the best split wins.
- Wrapped headers are stacked back together ("Balance"/"Units" -> "Balance
  Units"), and a merged Date+field column is split into two, matching how the
  original reads.
- Prose lines (titles, addresses, section names) are kept whole instead of
  being sliced across columns.
- Output is now a styled, bordered workbook with a real blue header row and
  Indian number formatting — both in the browser and the engine.

**Unchanged and re-verified:** all bank-statement handling. Real Axis statement
still 428/428 rows, totals exact, 100% balance-continuity; synthetic corpus
99.6/100; the browser pipeline passes the same tests end-to-end through real
pdf.js; page-load smoke test clean.

## v13.0 — Real-statement rebuild, benchmarked against PDF24's output (July 2026)

Tested directly against a real 15-page Axis Bank statement (428 transactions)
and PDF24's conversion of the same file. Result on that file: 428/428
transactions, one clean row each, every total exact to the paisa
(Dr 11,13,124.52 / Cr 11,90,645.40 / closing 2,80,643.50), 100%
balance-continuity, zero rows flagged.

**Fixed (the "entry split across 2 rows" defect):** Axis-style statements
print the narration's first line ABOVE the dated line. Transactions are now
grouped by vertical position — every line attaches to its nearest dated
anchor line — so multi-line entries always land in ONE row, whether the
narration sits above (Axis) or below (HDFC-style) the date.

**Fixed:** the table header is now found anywhere in the document (real
statements have long account-info blocks first; detection previously only
scanned the top rows, which silently degraded output to generic mode).
Cheque numbers bleeding into the date column no longer destroy rows — a
leading date is recognised and the remainder moved to the Ref column.

**New (PDF24-grade neatness in the browser):** the web app now writes a
properly styled workbook — bordered table, blue header row, frozen header,
Indian number formatting, red-highlighted rows needing review — via its own
OOXML writer (SheetJS community edition cannot write styles). The account-
holder block from page 1 is preserved above the table, and original columns
that ProPDF doesn't recognise (e.g. Init/Br) are kept for fidelity.

**Verified:** browser logic passes the real-statement test end-to-end through
actual pdf.js extraction; the generated styled workbook opens cleanly and its
styles/values were programmatically inspected; full corpus regression
(ruled/borderless/scanned/rotated statements, trial balance) still ≥97.8/100,
mean 99.6/100; page-load smoke test with zero JS errors.

## v12.0 — Smart converter in the browser + web-ready (July 2026)

Driven by a real bank statement that converted badly in v11.0 while PDF24
handled it: the columns drifted from page 2 onward. Root cause found, fixed,
and regression-tested — and the whole flagship pipeline now also runs
**directly in the browser**, so the GitHub Pages link needs no installation.

**Fixed:** multi-page statements where later pages have no header row and a
Value-Date column is empty no longer misalign. Column geometry is now derived
from the WHOLE document, not per page. Header mapping is verified and repaired
using column content (dates/amounts/text), so merged or garbled header cells
can't scramble the output. Candidate extractions are judged by a strict
balance-continuity score that counts unreadable balances against the result —
the failure mode from the real statement can no longer win selection.

**New — browser smart converter (`assets/js/xtract.js`):** the PDF→Excel tool
in the web app now does whole-document column detection, bank-statement
reconstruction, Indian number/date parsing, balance-continuity validation, a
REVIEW column marking every suspicious row, and a Validation sheet — 100%
client-side, works from the GitHub link, file://, anywhere. Scanned PDFs
auto-OCR in the browser (Tesseract.js) with confidence reporting.

**Changed:** the optional local engine is now presented as the "Power Pack" —
its tool cards only appear when it is actually detected, so web visitors never
see tools that need an install. Everything shown on the website works as-is.

**Verified:** Python engine suite 99.6/100 mean; the browser pipeline passes
identical ground-truth tests (150-txn realistic statement, ruled multi-page,
borderless: all totals exact to the paisa, 100% continuity), including an
end-to-end test through real pdf.js extraction; full-page load smoke test on a
simulated GitHub Pages URL with zero JS errors.

## v11.0 — ProPDF Engine (July 2026)

The largest engineering iteration so far, benchmarked against PDF24's tool
catalogue. Adds an optional **local** Python engine (127.0.0.1 only) that the
browser app auto-detects.

**Rebuilt:** PDF→Excel — document classification → multi-engine table
extraction (pdfplumber lines/text, PyMuPDF, ProPDF whitespace-stream) →
multi-page linking → bank-statement semantic reconstruction → balance-
continuity validation with a Validation sheet. Tested exact-to-the-paisa on
ruled, borderless and scanned statements. PDF→Word — real .docx (layout mode
via pdf2docx, editable mode via python-docx), auto-OCR, replaces the old
HTML-based .doc when the engine runs.

**New:** Word/Excel/PowerPoint→PDF (LibreOffice headless), Protect PDF
(AES-256), Repair PDF, Make Searchable PDF (OCR text layer + confidence),
Flatten PDF, Remove Metadata, Extract Images, Crop PDF, Page Size Converter,
Deskew & Auto-Rotate Scans, scan-aware Compress presets, engine status pill,
honest offline notices (no fake tools, ever).

**Testing:** ground-truth corpus + automated quality scoring
(`engine/tests/`). 18 tests, mean score ≈ 99/100; 120-page statement → 2,850
rows in ~42 s.

# ProPDF — Changelog

All notable changes to ProPDF, newest first. ProPDF is a 100% local, DPDP-aligned
PDF suite by **Kothari Jain & Associates**.

## v10.6 — PDF → Excel for any bank statement + password prompt
- **PDF → Excel** rebuilt to handle almost any statement layout — fully ruled
  grids, partly-ruled tables, and completely **borderless** statements. Columns
  are now detected **once across the whole document**, so every page lines up,
  and wrapped multi-line entries are merged into one transaction row using a
  **date anchor**. Verified across HDFC, ICICI, SBI, IDBI, Federal, South Indian
  Bank and Bank of Baroda statement formats.
- **Password-protected PDFs** now **prompt for the password** before any tool
  runs and are unlocked in memory — no more blank output. Applies to every tool
  (Excel, Word, Merge, Split, Rotate, Compress, Watermark, Page Numbers, Redact…).

## v10.5 — PDF → Excel: true grid extraction + sheet layout
- **PDF → Excel** now reads the table as a **true grid** — it detects both the
  **horizontal and vertical ruled lines** and places every word in its exact cell.
  Multi-line entries (e.g. wrapped bank-statement transactions) now stay in **one
  row on every page**. This fixes the bug where the first rows of pages 2, 3, …
  were dumped into a single column, and a stray extra column that shifted some
  pages out of alignment.
- New **Layout** option: export **one combined sheet** (default) or **one sheet
  per page**, like the major online converters.
- Repeated column headers on later pages are removed automatically in combined mode.

## v10.4 — Much better PDF → Excel
- **PDF → Excel** now detects the table's **ruled lines** for exact column splits,
  **groups multi-line rows** (e.g. bank-statement transactions) into a single row,
  and keeps amounts as numbers. Borderless tables fall back to smart whitespace
  detection. A major accuracy improvement on real statements.

## v10.3 — Fix: Redaction preview shows full pages
- **Redact** — the preview is now a single scrollable area that shows every page at
  full height. Scroll through all pages and draw redaction boxes anywhere.
  (Multi-page PDFs previously shrank each page to a thin strip.)

## v10.2 — Fix: Redaction page preview
- **Redact** — the page preview now shows each page at full size; multi-page PDFs
  previously collapsed to a thin strip. You can now see every page clearly and draw
  redaction boxes anywhere.
- Hardened the Compare visual-diff preview sizing.

## v10.1 — Fixes: Redaction detect & Interactive Overlay
- **Redact** — auto-detect now catches sensitive values split across text fragments
  (e.g. PAN, account numbers, emails) in iText / government PDFs; previously some
  were missed.
- **Overlay / Letterhead** — redesigned with on-screen handles: drag to move,
  corner to resize, top handle to rotate, with a live preview.

## v10 — Redaction, Overlay, Compare & OCR Workbench
- **Redact PDF** — auto-detects sensitive data (PAN, GSTIN, TAN, CIN, DIN, IFSC,
  Aadhaar, card / account numbers, emails, phones) and lets you draw redaction
  boxes by hand. Redacted pages are **permanently flattened** so hidden text can't
  be recovered; other pages keep their text. Works on scans via OCR; output is
  verified for no recoverable text.
- **Overlay / Letterhead** — stamp a letterhead, logo, signature or stamp
  (PDF/PNG/JPG) over chosen pages with position, size, rotation, opacity and a
  live preview.
- **Compare PDFs** — text differences (added / removed / changed) and visual
  pixel differences, with an exportable report; auto-OCR for scanned files.
- **OCR Workbench** — review and correct OCR text, validate PAN/GSTIN/Aadhaar/
  CIN/IFSC by checksum, and export to TXT, Word, Excel or a **searchable PDF**
  (image + invisible, selectable text layer).

## v9 — Compress to a target size
- **Compress PDF** can now hit a **target file size** — enter a limit in KB or MB
  (e.g. for GST / Income-Tax / MCA portals) and ProPDF automatically finds the best
  quality and resolution that stays under it.
- Reports the final size, and warns if the target isn't achievable without
  unreadable quality.

## v8 — Cleanup & Changelog
- Removed the non-working **Office → PDF** and **Password Protect** placeholders.
- Added an in-app **Changelog**.

## v7 — File previews
- **Page-thumbnail previews** of the attached file in every tool (Split / Extract,
  Merge, Rotate, Compress, Watermark, Page Numbers and all PDF → tools), each page
  numbered.
- Merge shows each file's pages grouped under its name, in the current order.
- Images → PDF previews the actual images before converting.

## v6 — Much better PDF → Excel tables
- Columns are now anchored to the table's **header row**, with each word placed by
  position — so Client ID, Client Name, quantities and ISIN stay in their own
  columns even when names are long.
- The table is automatically **separated** from the letterhead and signature text.
- Rows that wrapped to a second line are merged back; trailing rows detected via
  their numeric columns.
- Quantities saved as numbers; long IDs kept as text to avoid losing digits.

## v5 — Automatic OCR for scans
- **PDF → Excel** detects a scanned page (no text layer) and runs **OCR
  automatically** — no separate step.
- OCR reads word positions via TSV with confidence filtering; never produces a
  blank sheet.
- The same auto-OCR fallback added to **PDF → Text** and **PDF → Word**.
- Per-tool **OCR language** selector (English + Hindi, Marathi, Gujarati, Tamil,
  Telugu, Kannada, Bengali, Punjabi).

## v4 — One shareable file
- Repackaged the whole app into a **single self-contained `index.html`**.
- Fixed start-up / `file://` loading issues; added a cache-proof local launcher.

## v3 — Modern redesign
- New **Material + Glassmorphism** interface: frosted-glass panels, animated
  gradient background, refined dark / light themes and hover effects.

## v2 — Stability fix
- Fixed a critical bug where the tools failed to load, leaving buttons
  unresponsive.

## v1 — First release
- 100% local, DPDP-aligned PDF suite — no uploads, no cloud, no telemetry.
- Convert to PDF (Images, Text / CSV) and from PDF (JPG/PNG, Text, HTML, Word,
  Excel).
- Organize: Merge, Split / Extract, Rotate, Organize Pages.
- Optimize & Secure: Compress, Watermark, Page Numbers, Unlock.
- OCR (English + 10 Indian languages) and Smart Data Extract (PAN / GSTIN / TAN /
  CIN / DIN).
- Dark / light mode, drag-and-drop, search and full documentation.
