# ProPDF — Architecture

## 1. Design goals

1. **Privacy first** — no server, no uploads, no telemetry.
2. **Lean** — zero install, opens by double-clicking one file; tens of KB of app
   code, libraries loaded on demand.
3. **Maintainable** — a small registry-driven UI; each tool is an isolated module.
4. **Extensible** — a clear path to the optional Power Pack without changing the
   core.

## 2. Edition strategy

| Edition | Runtime | Covers | Footprint |
|---------|---------|--------|-----------|
| **Lean (this build)** | Browser only | Everyday conversion, organize, optimize, OCR, data extract | ~tens of KB + on-demand libs |
| **Power Pack (roadmap)** | Local Python (localhost) sidecar | Office→PDF, AES encryption, PaddleOCR/EasyOCR hybrid, batch/watch folders, DSC/eSign | Larger, optional install |

The lean edition deliberately avoids bundling Python + heavy OCR/Office engines
(which would balloon to 1–2 GB), because the spec prioritised a tool clients find
light and easy.

## 3. Folder structure

```
ProPDF/
├─ index.html              # app shell & entry point
├─ download-libs.bat       # vendor libraries for offline use
├─ README.md
├─ LICENSE                 # MIT
├─ assets/
│  ├─ css/styles.css       # theming (light/dark via CSS variables)
│  └─ js/
│     ├─ loader.js         # on-demand library loader (local → CDN fallback)
│     ├─ app.js            # UI shell: registry, nav, theme, dropzones, widgets
│     └─ tools.js          # all tool implementations + extraction algorithms
├─ lib/                    # (optional) vendored libraries for offline use
│  └─ README.md
└─ docs/
   ├─ INSTALLATION.md  USER_MANUAL.md  SECURITY.md  DPDP_COMPLIANCE.md
   ├─ ARCHITECTURE.md  DATABASE_SCHEMA.md  TESTING.md  ROADMAP.md
```

## 4. Runtime architecture

```
index.html
   │  loads (classic scripts, file://-safe — no ES modules)
   ├─ loader.js   →  window.ProPDFLibs.ensure("pdfLib","pdfjs",...)
   ├─ app.js      →  window.ProPDF  (registry + UI kit)
   └─ tools.js    →  ProPDF.registerTool({...}) × 19
```

- **Registry pattern:** every tool calls `ProPDF.registerTool({id, name, group,
  emoji, desc, long, render})`. `app.js` builds the sidebar, home grid, search and
  routing purely from the registry — adding a tool is one `registerTool` call.
- **On-demand loading:** `loader.js` injects each library the first time a tool
  needs it, trying `lib/<file>` then cdnjs. Startup stays minimal.
- **UI kit (`app.js`):** reusable `fileZone` (drag-drop + drag-reorder + remove),
  `progressWidget`, `resultWidget`, `toast`, `download`, `parseRanges`,
  `fmtSize`, theme manager.

## 5. Core libraries

| Library | Role |
|---------|------|
| **pdf-lib** | Create/modify PDFs: merge, split, rotate, watermark, page numbers, images→PDF, rebuild. |
| **pdf.js** | Read/render PDFs: text extraction, thumbnails, page→image, OCR rasterisation. |
| **SheetJS (xlsx)** | Build `.xlsx` workbooks with column widths. |
| **JSZip** | Bundle multi-file outputs into a ZIP. |
| **Tesseract.js** | Local OCR, English + 10 Indian languages. |

## 6. PDF → Excel table reconstruction (algorithm)

1. **Text harvest** — `pdf.js getTextContent()` yields fragments with absolute
   `(x, y)` transforms.
2. **Row clustering** — fragments are grouped into lines by `y` proximity
   (tolerance = *Row sensitivity*).
3. **Column detection** — all fragment `x` positions are sorted and clustered into
   column anchors using the *Column gap* threshold.
4. **Cell assignment** — each fragment is placed in the nearest column anchor.
5. **Type coercion** — numeric/currency strings become real numbers; dates kept
   as text; everything else preserved.
6. **Output** — `aoa_to_sheet` per page with auto-fitted column widths; one sheet
   per page (or concatenated CSV).

This positional approach is what separates ProPDF's output from naive
"text-dump" converters.

## 7. OCR pipeline

Images go straight to Tesseract; PDFs are rasterised page-by-page via pdf.js at
~2.2× scale, then OCR'd. Selected languages are passed as `eng+hin+mar…`.
Per-page progress is surfaced to the progress bar.

## 8. Extensibility

To add a tool: append one `ProPDF.registerTool({...})` block in `tools.js` with a
`render(panel)` function using the shared UI kit. No other file changes required.

---
