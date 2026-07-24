# ProPDF — Testing Documentation

## 1. Approach

Two layers of testing:

- **Automated (done during build):** static syntax checks of all JavaScript and
  unit tests of the pure algorithms (table reconstruction, field extraction, page
  range parsing).
- **Manual QA matrix (to run in-browser):** functional checks per tool against
  real CA documents. Listed below as a ready-to-execute checklist.

## 2. Automated results (executed during build)

| Check | Result |
|-------|--------|
| `node --check assets/js/loader.js` | ✅ Pass |
| `node --check assets/js/app.js` | ✅ Pass |
| `node --check assets/js/tools.js` | ✅ Pass |
| Tool registry count | ✅ 19 tools registered |
| `parseRanges("1-3,5,8-10", 12)` | ✅ → pages 1,2,3,5,8,9,10 |
| `parseRanges("5-1")` (reversed) | ✅ normalised to 1–5 |
| `parseRanges("10-20", 12)` | ✅ clipped to in-range pages |
| `buildGrid()` on a 2×3 sample table | ✅ correct rows/cols, numbers coerced |
| `extractFields()` PAN/GSTIN/TAN/amount/date/phone | ✅ all detected correctly |
| PAN-inside-GSTIN false positive | ✅ fixed via word-boundary regex |

## 3. Manual QA matrix

Legend: run each, mark Pass/Fail, note the test file used.

### Conversion
| # | Test | Expected |
|---|------|----------|
| C1 | Images → PDF (5 JPGs, reordered) | One PDF, correct order, pages match images |
| C2 | Text/CSV → PDF (large .txt) | Paginated, selectable text, no overflow |
| C3 | PDF → JPG/PNG (10-page PDF) | ZIP with 10 images at chosen dpi |
| C4 | PDF → Text (text PDF) | Accurate text, page separators |
| C5 | PDF → HTML | Valid HTML, readable |
| C6 | PDF → Word | Opens in MS Word, page breaks correct |

### PDF → Excel (flagship)
| # | Test | Expected |
|---|------|----------|
| X1 | Simple invoice table | Columns aligned, amounts numeric |
| X2 | GST return extract | Rows preserved, headers in row 1 |
| X3 | Bank statement (multi-page) | One sheet/page, debit/credit columns separate |
| X4 | Balance sheet / P&L | Labels + figures aligned |
| X5 | Scanned PDF (negative) | Empty/garbled → confirms OCR-first guidance |
| X6 | Sensitivity tuning | Tight/Loose visibly change row/col grouping |

### Organize
| # | Test | Expected |
|---|------|----------|
| O1 | Merge 3 PDFs reordered | Single PDF in chosen order |
| O2 | Split ranges `1-3,5` | Correct pages extracted |
| O3 | Split every 2 pages | ZIP of N/2 files |
| O4 | Rotate selected pages 90° | Only those pages rotate |
| O5 | Organize: drag/delete/duplicate | Output reflects edits, thumbnails render |

### Optimize & Secure
| # | Test | Expected |
|---|------|----------|
| S1 | Compress scanned PDF (High) | Noticeably smaller; banner shows % saved |
| S2 | Watermark with 0.15 opacity | Diagonal watermark on all pages |
| S3 | Page numbers "Page X of N" + prefix | Centred footer correct |
| S4 | Unlock owner-restricted PDF | Restrictions removed |
| S5 | Unlock open-password PDF (negative) | Clear error, no crash |

### OCR & Data
| # | Test | Expected |
|---|------|----------|
| R1 | OCR English scanned invoice | Readable text |
| R2 | OCR Hindi/Marathi notice | Correct script recognised |
| R3 | OCR mixed Eng+Hindi | Both recognised (both ticked) |
| R4 | Smart Extract on invoice | PAN/GSTIN/amounts/dates found; .xlsx exports |

### Robustness / environment
| # | Test | Expected |
|---|------|----------|
| E1 | 500-page PDF open | Loads without freezing UI |
| E2 | Corrupt PDF | Graceful error message, no crash |
| E3 | Password-protected PDF in non-unlock tools | Handled via `ignoreEncryption` or clear error |
| E4 | Offline run after `download-libs.bat` | All non-OCR tools work with no network |
| E5 | Windows 10 + Chrome / Edge | All tools functional |
| E6 | Windows 11 + Chrome / Edge | All tools functional |
| E7 | Dark/light toggle persists | Theme remembered on reload |

## 4. Known limitations (by design, lean edition)

- **Scanned PDF → Excel/Text** needs OCR first (image PDFs have no text layer).
- **Office → PDF** and **AES password protection** require the Power Pack.
- **PDF → Word** is a Word-openable `.doc` (text + page breaks), not pixel-perfect
  `.docx` with images.
- **Compress** rasterises pages (removes the text layer); re-OCR if needed.
- Very large OCR jobs are CPU-bound; process in batches.

## 5. Performance targets vs. edition

| Target (spec) | Lean edition | Notes |
|---------------|--------------|-------|
| Open 500-page PDF < 3s | Achievable on recommended hardware | pdf.js lazy-renders pages |
| OCR 100 pages < 5 min | Hardware-dependent | Power Pack (PaddleOCR) will be faster |
| Batch 100 files | Manual batches now; automated in Power Pack | — |

## 6. Sign-off criteria

A release is "ready" when all C/X/O/S/R rows pass on both Windows 10 and 11 with a
current Chromium browser, and E1–E7 pass.
