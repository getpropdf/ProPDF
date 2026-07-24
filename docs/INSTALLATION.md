# ProPDF — Installation Guide

ProPDF is a self-contained web application. There is **nothing to install** in the
traditional sense — no admin rights, no setup wizard, no background service.

## 1. Standard install (recommended)

1. Copy the entire **`ProPDF`** folder to any location, e.g.
   `C:\ProPDF` or a shared network drive.
2. Double-click **`index.html`**.
3. It opens in your default browser. Use **Google Chrome** or **Microsoft Edge**
   for best performance (both ship with Windows 10/11).

Optionally, right-click `index.html` → *Send to* → *Desktop (create shortcut)*,
then rename the shortcut to **ProPDF**.

## 2. Fully offline / air-gapped install

By default, ProPDF fetches its JavaScript libraries from the cdnjs CDN on first
use. (Your **documents** are never sent anywhere — only the library *code* loads.)
To remove all network dependence:

1. On a machine **with internet**, double-click **`download-libs.bat`**.
   It downloads the libraries into the `lib\` folder.
2. Copy the whole folder (now including `lib\`) to the offline machine.
3. ProPDF will load everything locally — no network calls at all.

### Fully offline OCR

The OCR engine downloads each language's `*.traineddata` file from a CDN on first
use and caches it in the browser. For a 100% offline OCR setup:

1. Download the required language files from the Tesseract `tessdata` repository
   (e.g. `eng.traineddata`, `hin.traineddata`, `mar.traineddata`, …).
2. Create `lib\tessdata\` and place them there.
3. In `assets/js/tools.js`, set the Tesseract option
   `langPath: "lib/tessdata"` inside the two `Tesseract.recognize(...)` option
   objects (a one-line change, documented in code comments).

## 3. System requirements

| Item | Minimum | Recommended |
|------|---------|-------------|
| OS | Windows 10 (64-bit) | Windows 11 |
| Browser | Chrome / Edge / Firefox (current) | Latest Chrome or Edge |
| RAM | 4 GB | 8 GB+ (for OCR & large files) |
| Disk | 30 MB (200 MB+ with OCR language data) | — |

Works equally on macOS and Linux browsers.

## 4. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Tools say "failed to load engine" | You're offline and `lib\` is empty — run `download-libs.bat`, or reconnect once. |
| OCR is slow on first run | It's downloading language data once; subsequent runs are fast (cached). |
| Thumbnails don't appear in Organize | Some browsers block `file://` workers — try Chrome/Edge, or serve the folder with any local web server. |
| "PDF → Excel" output is messy | The PDF is scanned (an image). Run **OCR** first, or adjust *Row sensitivity* / *Column gap*. |
| Large PDF feels slow | Close other tabs; OCR/compress are CPU-heavy. Process in smaller batches. |

### Optional: run via a local server (avoids all `file://` quirks)

```bat
cd C:\ProPDF
python -m http.server 8000
```
Then open `http://localhost:8000`. Nothing leaves your machine — the server is
local-only.

---
Support: Kothari Jain & Associates — +91 90963 16155 — info.kotharijain@gmail.com
