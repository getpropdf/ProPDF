# ProPDF — DPDP Act 2023 Compliance Notes

> **Disclaimer:** This document explains how ProPDF's design supports compliance
> with India's Digital Personal Data Protection Act, 2023 (DPDP Act). It is
> informational, not legal advice. Each firm remains responsible for its own
> compliance posture and should consult counsel for its specific obligations.

## 1. Why ProPDF is DPDP-friendly by design

The DPDP Act governs the processing of **digital personal data**. ProPDF's
architecture minimises regulatory exposure because **it does not transmit, store,
or share personal data with any third party**. Documents are processed locally and
discarded from memory when the operation ends.

In DPDP terms, when a firm uses ProPDF on its own devices to process its own
clients' documents, **no personal data is disclosed to ProPDF or to Kothari Jain &
Associates** — there is no Data Processor relationship created by the software,
because the software has no servers and receives no data.

## 2. Alignment with key DPDP principles

| DPDP principle | How ProPDF supports it |
|----------------|------------------------|
| **Purpose limitation** | Data is used only for the conversion/processing the user initiates, then released. |
| **Data minimisation** | Only the file the user selects is read; nothing extra is collected. |
| **Storage limitation** | Nothing is persisted — no copies, caches, or logs of document content. |
| **No unauthorised disclosure** | No network transmission of documents; no third-party sharing. |
| **Security safeguards** | Browser-sandboxed in-memory processing; optional full air-gapping; see `SECURITY.md`. |
| **Accountability** | Optional local-only audit log (Power Pack) records actions without exposing content. |

## 3. Roles under the DPDP Act

- **Data Fiduciary:** the firm using ProPDF (it determines purpose & means).
- **Data Principal:** the firm's client whose document is processed.
- **ProPDF / Kothari Jain & Associates:** **not** a Data Processor in the cloud
  sense — the software provider never receives any personal data.

## 4. Practical compliance checklist for firms

1. Use ProPDF on firm-controlled, access-protected devices.
2. Vendor libraries + OCR data locally to guarantee no external calls
   (`download-libs.bat`; see `INSTALLATION.md`).
3. Apply your existing record-retention policy to the **output files** you save.
4. Restrict the **Unlock** tool to documents you are authorised to modify.
5. Maintain device-level security (disk encryption, screen lock, AV) per your IT
   policy.
6. For shared PCs, close the ProPDF tab after use (no temp data remains).

## 5. Data Principal rights

Because ProPDF holds no personal data, requests by Data Principals to access,
correct or erase data are satisfied entirely through the firm's own records —
ProPDF has nothing to surface, correct, or delete.

## 6. Cross-border data transfer

ProPDF performs **no** cross-border transfer of personal data. All processing is
on-device, within India (or wherever the device is located), with no cloud routing.

---
Compliance queries: Kothari Jain & Associates — info.kotharijain@gmail.com
