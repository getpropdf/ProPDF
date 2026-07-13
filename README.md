# ProPDF — Professional PDF Tools. Your Data Never Leaves Your Office.

**Enterprise PDF processing suite that runs 100% on your own computer.**
No cloud. No uploads. No telemetry. DPDP-aligned by design. Free to use and share.

*Prepared by **Kothari Jain & Associates** — Mob: +91 90963 16155 — info.kotharijain@gmail.com*

---

## What it is

ProPDF is a lean, zero-install PDF toolkit built for Chartered Accountants,
advocates, consultants, SMEs and government professionals. Every file is
processed locally inside your browser's sandbox — your documents are **never**
sent to any server.

This is the **lean browser edition**. It opens by double-clicking one file and
covers the day-to-day PDF work a practice actually needs. The heaviest AI/OCR
engines (PaddleOCR, EasyOCR, LibreOffice-grade Office conversion, AES
encryption) are scoped as an optional **Power Pack** — see `docs/ROADMAP.md` —
so the core tool stays small and fast.

## Quick start

1. Download/copy the whole `ProPDF` folder.
2. Double-click **`index.html`** (opens in Chrome, Edge or Firefox).
3. Pick a tool, drop your file in, and process. Output downloads to your machine.

> First use loads small JS libraries from a CDN. To run **fully offline**, run
> `download-libs.bat` once (see `docs/INSTALLATION.md`).

## Features (working in this edition)

**Convert to PDF:** Images → PDF, Text/CSV → PDF.
**Convert from PDF:** PDF → JPG/PNG, PDF → Text, PDF → HTML, PDF → Word, **PDF → Excel (flagship: smart bank-statement reconstruction with balance-continuity validation — right in the browser)**.
**Organize:** Merge (drag-to-order), Split / Extract (ranges, every N, per page), Rotate, Organize pages (thumbnail reorder / delete / duplicate).
**Optimize & Secure:** Compress (scanned PDFs), Watermark, Page numbers, Unlock (remove owner restrictions).
**OCR & Data:** Multi-language OCR (English + 10 Indian languages), Smart Data Extract (PAN / GSTIN / TAN / CIN / DIN / amounts / dates).

**Optional Power Pack for offices (free local engine — see `docs/ENGINE.md`; web visitors don't need it, its tools appear only when it runs):** high-accuracy
PDF → Excel with document classification, bank-statement reconstruction and
balance-continuity validation; real PDF → Word (.docx, layout & editable modes);
Word / Excel / PowerPoint → PDF (LibreOffice); searchable OCR PDFs with
confidence scores; AES-256 protection; repair; scan-aware compression; flatten;
metadata removal; image extraction; crop; page-size conversion; deskew.
The engine runs on 127.0.0.1 only — still zero cloud, zero uploads.

**Still on the roadmap:** batch/watch-folder automation, digital signatures
(DSC / Aadhaar eSign), PDF/A. See `docs/ROADMAP.md` and `docs/PDF24_GAP_ANALYSIS.md`.

## Documentation

| Doc | Contents |
|-----|----------|
| `docs/INSTALLATION.md` | Install, offline setup, troubleshooting |
| `docs/USER_MANUAL.md` | Step-by-step guide to every tool |
| `docs/SECURITY.md` | Security model & threat analysis |
| `docs/DPDP_COMPLIANCE.md` | India DPDP Act 2023 alignment |
| `docs/ARCHITECTURE.md` | How it's built |
| `docs/DATABASE_SCHEMA.md` | Local SQLite schema (for Power Pack) |
| `docs/TESTING.md` | Test plan, cases & results |
| `docs/ROADMAP.md` | Future upgrades |
| `LICENSE` | MIT (free to use, modify, distribute) |

## Privacy promise

> **All files are processed locally on your computer. No documents are uploaded
> or shared with any external party.**

---
© Kothari Jain & Associates. Released free for the professional community.

## Live version & automatic updates

ProPDF can be published **free** on GitHub Pages so everyone always gets the latest
version from one link (your documents still never leave the browser — only the app
code is served). See **`docs/DEPLOY_GITHUB_PAGES.md`** for a step-by-step guide.

- The app shows its **version** next to the logo and an **"Update available"**
  notice when a newer version is published (driven by `version.json`).
- What changed in each version: see **[CHANGELOG.md](CHANGELOG.md)** or the
  **Changelog** tab inside the app.
