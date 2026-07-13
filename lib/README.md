# /lib — vendored libraries (optional, for offline use)

ProPDF loads its JavaScript libraries from this folder **first**. If a file is
missing here, it automatically falls back to the cdnjs CDN.

To make ProPDF run **fully offline / air-gapped**, place these files here by
running `download-libs.bat` (Windows) once on an internet-connected machine:

| File | Purpose |
|------|---------|
| `pdf-lib.min.js` | Create / merge / split / rotate / watermark PDFs |
| `pdf.min.js` | Render & read PDFs |
| `pdf.worker.min.js` | pdf.js background worker |
| `xlsx.full.min.js` | Excel / CSV export |
| `jszip.min.js` | ZIP bundling for multi-file output |
| `tesseract.min.js` | OCR engine |

> **OCR language data:** Tesseract downloads each language's `.traineddata`
> from a CDN on first use, then caches it. For a truly air-gapped OCR setup,
> see `docs/INSTALLATION.md` → "Fully offline OCR".

**Your documents are never sent anywhere.** Only the library *code* above may be
fetched from a CDN if you choose not to vendor it locally.
