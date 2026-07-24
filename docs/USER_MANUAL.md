# ProPDF — User Manual

A practical, tool-by-tool guide. Every tool follows the same rhythm:
**drop a file → set options → click the action button → output downloads.**
A progress bar shows status; a green banner confirms success.

## The interface

- **Top bar** — logo (click to go Home), tool search, and the 🌙/☀️ dark/light toggle (your choice is remembered).
- **Sidebar** — all tools grouped by category.
- **Privacy banner** — a permanent reminder that processing is 100% local.
- **Footer** — firm contact details and the privacy statement.

---

## Convert to PDF

### Images → PDF
Drop JPG/PNG images, **drag them to set the order**, choose *Match image size* or
*A4 (centered)*, optionally add a margin, then **Create PDF**.

### Text / CSV → PDF
Drop a `.txt` or `.csv`, pick font size and page size, **Create PDF**. Produces a
paginated PDF with selectable text.

---

## Convert from PDF

### PDF → JPG / PNG
Choose format and resolution (110–220 dpi). Each page is rendered and the set is
delivered as a ZIP.

### PDF → Text
Extracts selectable text page-by-page. Preview on screen, then **Download .txt**.
*(Scanned PDF? Use OCR instead.)*

### PDF → HTML
Creates a clean, styled HTML document from the PDF text.

### PDF → Word
Creates a `.doc` that opens directly in Microsoft Word, with one page break per
PDF page. *(Layout-perfect `.docx` with images is on the Power Pack roadmap.)*

### PDF → Excel  *(flagship)*
The smart table extractor. It analyses the **position** of every text fragment,
clusters them into rows and columns, preserves numbers/dates as real values, and
writes a clean workbook — **one sheet per page** — with auto-fitted columns.

- **Output:** Excel `.xlsx` or `.csv`.
- **Row sensitivity:** how aggressively lines are merged (Tight / Normal / Loose).
- **Column gap:** the spacing that separates columns (Tight / Normal / Loose).

> Tip: if columns merge or split incorrectly, nudge *Column gap*. If two rows
> merge into one, switch *Row sensitivity* to **Tight**. Best results come from
> text-based (non-scanned) PDFs; scanned files should be OCR'd first.

---

## Organize

### Merge PDFs
Add two or more PDFs, **drag to reorder**, then **Merge**.

### Split / Extract
Three modes: *Extract pages / ranges* (e.g. `1-3,5,8-10`), *Every N pages*, or
*One file per page*. Multiple outputs are bundled as a ZIP.

### Rotate
Rotate the whole document or specific pages by 90° / 180° / 270°.

### Organize Pages
Drop a PDF to see page thumbnails. **Drag** to reorder, **✕** to delete, **⧉** to
duplicate, then **Save reorganized PDF**.

---

## Optimize & Secure

### Compress PDF
Reduces size by re-rendering pages as optimised JPEGs (High / Medium / Low). Ideal
for bulky scanned documents. The result is image-based — run **OCR** afterwards if
you need selectable text. The success banner shows the before/after size.

### Watermark PDF
Add a diagonal text watermark with custom text, opacity, font size and colour
across every page.

### Add Page Numbers
Stamp `1, 2, 3…` or `Page 1 of N`, with an optional footer prefix (e.g. your firm
name), centred at the bottom.

### Unlock PDF
Removes **owner-level** restrictions (print/copy/edit limits) from documents you're
authorised to modify. Files locked with an **open password** cannot be opened
without it — by design.

---

## OCR & Data

### OCR (Scanned → Text)
Reads scanned PDFs and images using a local Tesseract engine. **Tick every
language** that appears in the document — English plus Hindi, Marathi, Gujarati,
Tamil, Telugu, Kannada, Malayalam, Punjabi, Bengali and Urdu, including mixed
documents. Preview the text, then **Download .txt**.
*(First run downloads language data once, then caches it.)*

### Smart Data Extract
Scans the PDF text and pulls out **PAN, GSTIN, TAN, CIN, DIN**, invoice numbers,
amounts, dates, emails and phone numbers into a table you can **download as
.xlsx**. Great for triaging invoices, notices and statements.

---

## Keyboard & workflow tips

- Use the **search box** to jump to any tool by name.
- Dark mode is easier on the eyes for long sessions; your preference persists.
- For 100+ files, process in batches per tool; the Power Pack will add true
  batch/folder automation (roadmap).

---
Questions? Kothari Jain & Associates — +91 90963 16155 — info.kotharijain@gmail.com
