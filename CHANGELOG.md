# ProPDF — Changelog

All notable changes to ProPDF, newest first. ProPDF is a 100% local, DPDP-aligned
PDF suite by **Kothari Jain & Associates**.

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
