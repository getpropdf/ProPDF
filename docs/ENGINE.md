# ProPDF Engine — local processing sidecar

The ProPDF Engine is a small Python service that runs **on your own computer
only** (it binds to 127.0.0.1 and accepts no outside connections). The browser
app auto-detects it and shows an "⚡ Engine: on" pill in the header. Nothing
is ever uploaded; when the engine is off, every engine tool says so honestly
instead of pretending to work.

## What the engine adds

High-accuracy **PDF → Excel** (document classification, multi-engine table
extraction, bank-statement semantic reconstruction, balance-continuity
validation, auto-OCR with confidence scores); real **PDF → Word (.docx)** in
Layout and Editable modes; **Word/Excel/PowerPoint → PDF** via local
LibreOffice; **searchable OCR PDFs**; **AES-256 protection**; **repair**;
**scan-aware compression**; **flatten**; **metadata removal**; **image
extraction**; **crop**; **page-size conversion**; **deskew/auto-rotate**.

## Install (Windows, one time)

1. Install Python 3.10+ from python.org — tick **"Add python.exe to PATH"**.
2. Run `engine\Install Engine (Windows).bat`.
3. Optional but recommended:
   - **Tesseract OCR** (scanned PDFs): https://github.com/UB-Mannheim/tesseract/wiki
     — during setup, select the Indian languages you need (Hindi, Marathi, …).
   - **LibreOffice** (Office → PDF): https://www.libreoffice.org/download/
   - **Ghostscript** (better compression/repair of text PDFs): https://ghostscript.com

## Run

Double-click `engine\Start Engine.bat` and keep the window open.
ProPDF's header pill turns green within a few seconds (click it to re-check).

## Privacy model

- Binds to `127.0.0.1:8712` — unreachable from the network.
- No telemetry, no logging of document content.
- Input/output files are written to the Windows temp folder and deleted after
  each request is served.
- All engines are open-source and run offline: PyMuPDF, pdfplumber, pikepdf,
  openpyxl, python-docx, pdf2docx, Tesseract, LibreOffice, Ghostscript, OpenCV.

## The PDF → Excel pipeline (flagship)

1. **Classify** — native text vs scanned per page, rotation, ruled lines,
   document type (bank statement, trial balance, GSTR, 26AS, invoice, …).
2. **OCR when needed** — automatic; 300 dpi render, orientation fix (OSD),
   deskew, word boxes with confidence. You never OCR manually first.
3. **Extract candidates** — pdfplumber (lines & text strategies), PyMuPDF
   tables, and ProPDF's own whitespace-stream engine at multiple gap
   thresholds.
4. **Score & select** — candidates scored on fill ratio, column consistency
   and numeric coherence; the best grid wins per page.
5. **Link pages** — repeated headers dropped, continuation pages merged.
6. **Semantic reconstruction** — for bank statements: canonical columns
   (Date / Value Date / Particulars / Ref / Dr / Cr / Balance), multi-line
   narrations merged, Indian numbers and dates parsed to real types.
7. **Validate** — every row must satisfy
   `previous balance − debit + credit = balance` (±0.01). Failures are
   highlighted red in the sheet and listed in the Validation sheet with a
   confidence percentage. Totals are written as auditable SUM formulas.

## API (for automation)

`GET /health` — status and capabilities.
`POST /classify` — document profile JSON.
`POST /convert/excel` (file, langs, one_sheet, force_ocr) — returns .xlsx;
conversion report in the `X-ProPDF-Result` header.
`POST /convert/word` (file, mode=layout|editable, langs) — returns .docx.
`POST /convert/office2pdf` (file) — returns .pdf.
`POST /ocr/searchable` (file, langs, dpi) — returns searchable .pdf.
`POST /tool/{protect|unlock|repair|compress|flatten|strip-metadata|extract-images|crop|resize|deskew}`
(file, params JSON) — returns the processed file.

## Testing

`engine/tests/make_corpus.py` generates a ground-truth corpus (multi-page
ruled & borderless bank statements, scanned/rotated/low-quality variants,
trial balance, invoice, 120-page stress file). `engine/tests/run_tests.py`
runs every pipeline, opens each output, validates totals to the paisa and
prints 0–100 quality scores. Do not ship changes that lower these scores.
