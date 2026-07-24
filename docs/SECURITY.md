# ProPDF — Security Documentation

## 1. Security objective

ProPDF's core security guarantee is **data locality**: user documents are
processed entirely within the user's own browser sandbox and are **never
transmitted to any server**. This is achieved structurally, not by policy — there
is no backend to receive files.

## 2. Architecture & trust model

```
            ┌──────────────────────────────────────────┐
            │            User's computer                │
            │                                           │
   File ───►│  Browser sandbox (ProPDF)                 │
            │   • pdf-lib / pdf.js / SheetJS / Tesseract│
            │   • all processing in JS, in-memory       │
            │                                           │
   Output ◄─│  Browser "Save" → user's disk             │
            └──────────────────────────────────────────┘
              (no network path for documents — at all)
```

- **No server-side component.** There is no upload endpoint, API, or database
  that receives documents.
- **In-memory processing.** Files are read into memory (`ArrayBuffer`), processed,
  and the result is offered as a download. Nothing is written to disk except the
  output the user explicitly saves.
- **Only output the user chooses leaves memory**, via the standard browser save
  dialog, to a location the user picks.

## 3. Network behaviour

| Traffic | Sent? | Notes |
|---------|-------|-------|
| User documents | **Never** | No code path transmits document bytes. |
| JS libraries (pdf-lib, pdf.js, SheetJS, JSZip, Tesseract) | First load only, if not vendored | Loaded from cdnjs; eliminate entirely with `download-libs.bat`. |
| OCR language data (`*.traineddata`) | First OCR run only | Cached afterward; can be vendored for full offline use. |
| Telemetry / analytics | **Never** | No trackers, beacons, pixels or analytics SDKs. |

**Verification:** open the browser DevTools → *Network* tab while processing a
file. You will see **zero** outbound requests carrying document content. The only
requests ever made are for the static libraries above (and none at all once
vendored).

## 4. Data lifecycle & cleanup

- Document data lives only in JavaScript memory for the duration of the operation.
- On page close/refresh, the JS heap is released by the browser; nothing persists.
- ProPDF writes **no** copies, temp files, caches, or logs of document content.
- The only persisted setting is the UI theme (`light`/`dark`) in `localStorage` —
  no document data is ever stored there.

## 5. Threat analysis (lean edition)

| Threat | Mitigation |
|--------|------------|
| Document exfiltration to a server | No server exists; no upload code path. |
| Third-party tracking | No analytics/telemetry of any kind. |
| Supply-chain (tampered CDN library) | Vendor libraries locally (`lib\`) and host them yourself; optionally add Subresource Integrity hashes (see §6). |
| Malicious PDF (parser exploit) | Parsing runs inside the browser's hardened sandbox; keep the browser updated. |
| Data left on shared PC | No temp files are written; clear the browser tab when done. |
| Unauthorised "Unlock" use | Tool only strips *owner* restrictions and warns the user; *open-password* encryption cannot be bypassed. |

## 6. Hardening recommendations for firms

1. **Vendor all libraries** (`download-libs.bat`) and remove CDN reliance.
2. **Add SRI hashes** to the local script tags if serving over a LAN.
3. **Run from a read-only network share** so the app itself can't be modified by
   end users.
4. **Disable the browser's outbound network** for the ProPDF profile if you want
   provable air-gapping (after vendoring libraries + OCR data).
5. **Standardise on one updated browser** across the firm.

## 7. Power Pack (roadmap) security notes

The optional local Python Power Pack (AES encryption, PaddleOCR/EasyOCR, Office
conversion, batch/watch folders) runs as a **localhost-only** service bound to
`127.0.0.1`, with encrypted temp files, secure deletion (overwrite-then-unlink),
and a local-only SQLite audit log. It introduces no cloud dependency. See
`docs/ARCHITECTURE.md` and `docs/DATABASE_SCHEMA.md`.

---
Security contact: Kothari Jain & Associates — info.kotharijain@gmail.com
