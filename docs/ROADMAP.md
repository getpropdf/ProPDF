# ProPDF — Future Upgrade Roadmap

ProPDF ships in two tiers. The **lean browser edition** (this build) is complete
and usable today. The **Power Pack** adds the heavy, compute-intensive capabilities
that genuinely need a local engine — kept optional so the core stays small.

## Phase 1 — Lean edition (DELIVERED)

Convert to/from PDF, merge, split, rotate, organize, compress, watermark, page
numbers, unlock, multi-language OCR, smart data extract; dark/light UI, drag-drop,
progress, search; full documentation; offline vendoring; MIT license.

## Phase 2 — ProPDF Power Pack (optional local engine)

A small **localhost-only** Python (FastAPI) sidecar bound to `127.0.0.1`,
packaged as an optional installer. Still 100% local, no cloud.

- **Office → PDF** (Word/Excel/PPT) via local LibreOffice headless — layout-perfect.
- **AES-256 password protection** with user/owner passwords and granular
  permissions (pikepdf).
- **Advanced OCR hybrid engine** — Tesseract + PaddleOCR + EasyOCR with
  auto-selection of the best engine per page; handwriting best-effort.
- **Layout-perfect PDF → Word `.docx`** with images and styles.
- **Searchable / layered OCR PDFs** (text layer over the scan), tagged & accessible
  PDFs.
- **Repair PDFs** — structure repair and content recovery (Ghostscript/pikepdf).
- **High-ratio compression** with image/font/object optimisation (Ghostscript).

## Phase 3 — Enterprise automation

- **Batch everything** — 100+ files, batch OCR/compress/convert/rename.
- **Folder & watch-folder processing** with workflow templates.
- **Local SQLite** for recent files, favorites, audit logs, usage analytics
  (all local — see `DATABASE_SCHEMA.md`).
- **Crash recovery & autosave** for long jobs.
- **Multi-threaded / worker-pool** processing for speed.

## Phase 4 — Signing & advanced extraction

- **Digital signatures** — USB token & Class-3 DSC support, timestamping,
  signature verification.
- **Aadhaar eSign** integration readiness.
- **AI document understanding** — structured extraction for invoices, GST returns,
  bank statements, ledgers, vendor statements, tax notices, with key-information
  summarisation (local models / on-device inference).

## Phase 5 — Packaging & distribution

- **Tauri desktop wrapper** for a native window, file associations, and a single
  installer — chosen over Electron to keep the footprint small, consistent with the
  lean philosophy.
- Auto-update channel (optional, opt-in, no telemetry).
- Signed Windows installer for easy firm-wide rollout.

## Guiding principles (unchanged across phases)

1. Data never leaves the device.
2. No telemetry, ever.
3. Optional bulk — never force a heavy install on users who don't need it.
4. Free to use and share.

---
Priorities can be reordered to suit the firm's needs — contact
Kothari Jain & Associates — +91 90963 16155 — info.kotharijain@gmail.com
