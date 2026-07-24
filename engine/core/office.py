"""Office (Word / Excel / PowerPoint / ODF / images) -> PDF via LibreOffice
headless. Detects the local LibreOffice install; never fails silently."""
from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from typing import Optional

_WIN_CANDIDATES = [
    r"C:\Program Files\LibreOffice\program\soffice.exe",
    r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
]

SUPPORTED_EXT = {".doc", ".docx", ".odt", ".rtf", ".txt",
                 ".xls", ".xlsx", ".ods", ".csv",
                 ".ppt", ".pptx", ".odp"}


def find_soffice() -> Optional[str]:
    p = shutil.which("soffice") or shutil.which("libreoffice")
    if p:
        return p
    for c in _WIN_CANDIDATES:
        if os.path.exists(c):
            return c
    return None


def office_available() -> bool:
    return find_soffice() is not None


def convert_office_to_pdf(src: str, out_path: str, timeout: int = 300) -> dict:
    soffice = find_soffice()
    if not soffice:
        raise RuntimeError(
            "LibreOffice is not installed. Office → PDF needs LibreOffice "
            "(free, local). Install it from https://www.libreoffice.org/download/ "
            "and restart the ProPDF Engine.")
    ext = os.path.splitext(src)[1].lower()
    if ext not in SUPPORTED_EXT:
        raise RuntimeError(f"Unsupported input type: {ext}")
    outdir = tempfile.mkdtemp(prefix="propdf_lo_")
    try:
        # separate profile dir avoids clashes with a running desktop LibreOffice
        profile = tempfile.mkdtemp(prefix="propdf_lo_profile_")
        cmd = [soffice, "--headless", "--norestore",
               f"-env:UserInstallation=file://{profile}",
               "--convert-to", "pdf", "--outdir", outdir, src]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        produced = os.path.join(
            outdir, os.path.splitext(os.path.basename(src))[0] + ".pdf")
        if not os.path.exists(produced):
            raise RuntimeError(
                "LibreOffice conversion failed: "
                + (r.stderr or r.stdout or "no output produced").strip()[:500])
        shutil.move(produced, out_path)
        return {"engine": "libreoffice", "soffice": soffice}
    finally:
        shutil.rmtree(outdir, ignore_errors=True)
        try:
            shutil.rmtree(profile, ignore_errors=True)
        except Exception:
            pass
