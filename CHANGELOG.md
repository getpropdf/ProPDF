# ProPDF — Changelog

All notable changes to ProPDF, newest first. ProPDF is a 100% local, DPDP-aligned
PDF suite by **Kothari Jain & Associates**.

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
