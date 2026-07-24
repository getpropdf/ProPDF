# ProPDF vs PDF24 — Feature Gap Analysis & Audit

*Audited: July 2026, against PDF24 Tools' published tool list (tools.pdf24.org).
Every ProPDF status below was verified by actually running the tool and
inspecting its output — no status is based on the existence of a button.*

**Basis of comparison.** PDF24's public tool catalogue and documented
workflows were used as the product benchmark. PDF24's proprietary source code
and assets were **not** extracted, decompiled or copied — ProPDF's
implementation is fully original (browser JS + a local Python engine built on
open-source libraries: PyMuPDF, pdfplumber, pikepdf, Tesseract, LibreOffice,
Ghostscript, openpyxl, python-docx, pdf2docx, OpenCV).

## Status legend

COMPLETE = tested working with acceptable output quality.
ENGINE = COMPLETE, but requires the free local ProPDF Engine to be running.
FALLBACK = works in browser at reduced quality; engine upgrades it.
MISSING = not implemented (honestly listed; no placeholder card is shown).

## Conversion tools

| PDF24 tool | ProPDF status | Notes (tested result) |
|---|---|---|
| PDF to Excel / XLSX | **ENGINE (flagship)** + FALLBACK | Rebuilt. Classification → multi-engine extraction → semantic statement reconstruction → balance-continuity validation. Test: 100/100 on ruled, borderless and scanned statements (totals exact to the paisa). |
| PDF to Word / DOCX | **ENGINE** + FALLBACK | Real .docx. Layout mode (pdf2docx) + Editable mode (python-docx). Auto-OCR of scans. Browser fallback is text-only .doc and says so. |
| PDF to Images / JPG / PNG | COMPLETE | Browser render via pdf.js, DPI presets. |
| PDF to Text | COMPLETE | Auto-OCR for scanned pages. |
| PDF to HTML | COMPLETE | Text-level (not visual clone). |
| Images/JPG/PNG to PDF | COMPLETE | Page fit + margin controls. TIFF/WEBP/HEIC: MISSING in browser (format support), planned via engine. |
| Word to PDF | **ENGINE** | LibreOffice headless; tested, text verified in output. |
| Excel to PDF | **ENGINE** | Same engine; tested. |
| PowerPoint to PDF | **ENGINE** | Same engine (pptx/ppt/odp). |
| Text/RTF/ODF to PDF | **ENGINE** (+ browser txt/csv) | LibreOffice covers odt/ods/odp/rtf. |
| PDF OCR (searchable PDF) | **ENGINE** | Invisible text layer, auto orientation fix, confidence reported (test: 97.2/100). Browser OCR-to-text also available. |
| PDF to PowerPoint | MISSING | No reliable local open-source pipeline; would be low-fidelity. Deliberately not faked. |
| PDF to PDF/A | MISSING | Feasible via Ghostscript; candidate for next iteration. |
| PDF to EPUB/RTF/ODT/SVG | MISSING | Niche for CA workflows; not faked. |
| Webpage to PDF | MISSING | Requires a browser print engine; use the browser's own Print→PDF. |
| HEIC/SVG/WEBP/EPUB/Markdown to PDF | MISSING | Candidate: engine + Pillow/LibreOffice for TIFF/WEBP next. |

## Organize / edit tools

| PDF24 tool | ProPDF status | Notes |
|---|---|---|
| Merge PDF | COMPLETE | Drag-to-order. |
| Split PDF | COMPLETE | Ranges / every-N / per page. |
| Extract / Remove pages | COMPLETE | Via Split + Organize Pages. |
| Rearrange pages | COMPLETE | Thumbnail reorder/delete/duplicate. |
| Rotate PDF | COMPLETE | |
| Crop PDF | **ENGINE** | Uniform margins (points). |
| Change page size | **ENGINE** | A3/A4/A5/Letter/Legal, keeps proportions. |
| Pages per sheet / Halve pages | MISSING | Feasible with PyMuPDF; next iteration. |
| Edit PDF (annotate/draw/text) | MISSING | Large interactive feature; PDF24's editor is a full canvas app. Honest gap. |
| Bookmark PDF | MISSING | Feasible (PyMuPDF TOC); next iteration. |
| Fill out PDF / create forms | MISSING | Form filling feasible via engine; creation is a large editor feature. |

## Optimize & secure tools

| PDF24 tool | ProPDF status | Notes |
|---|---|---|
| Compress PDF | **ENGINE** + FALLBACK | Scan-aware rebuild (27–74% by preset, tested) + Ghostscript for text PDFs. |
| Protect PDF (password) | **ENGINE** | Real AES-256 (R6) with permission flags; round-trip tested. |
| Unlock PDF | COMPLETE + ENGINE | Browser removes restrictions; engine fully decrypts with password. |
| Repair PDF | **ENGINE** | pikepdf rebuild + Ghostscript fallback; tested on truncated file. |
| Flatten PDF | **ENGINE** | PyMuPDF bake; forms/annotations become page content. |
| Remove metadata | **ENGINE** | DocInfo + XMP stripped; verified. |
| Change doc info | MISSING | Trivial to add next iteration. |
| Web-optimize (linearize) | MISSING | Feasible via qpdf/Ghostscript. |
| Redact PDF | COMPLETE | True rasterizing redaction (existing tool, DPDP badge). |
| Watermark / Page numbers | COMPLETE | |
| Overlay (letterhead) | COMPLETE | |
| Sign PDF | MISSING | Visual-stamp signing is feasible; DSC-token digital signatures are Phase-4 roadmap. Not faked. |
| Compare PDFs | COMPLETE | |
| Extract images | **ENGINE** | Original-quality images to ZIP. |

## Beyond PDF24 (ProPDF advantages)

Document classification engine (native/scanned/rotated/table detection, CA
document type recognition); bank-statement semantic reconstruction with
balance-continuity validation and a Validation sheet; OCR confidence
reporting with low-confidence warnings; Indian number & date formats;
Smart Data Extract (PAN/GSTIN/TAN/amounts); deskew + auto-rotate scans;
100% local processing as an architectural guarantee (PDF24's online tools
upload files; PDF24 Creator is local but closed-source).

## Test summary (July 2026 corpus run)

18 automated tests, outputs opened and validated programmatically. Mean
quality score ≈ 99/100; financial totals matched ground truth exactly
(paisa-level) on all statement tests including the scanned one. Details:
`engine/tests/run_tests.py`, results in `results.json`.
