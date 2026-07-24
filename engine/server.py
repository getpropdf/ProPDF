"""ProPDF Engine — local processing sidecar.

Binds to 127.0.0.1 ONLY. No document ever leaves this machine.
The browser UI auto-detects this engine at http://127.0.0.1:8712 and routes
heavy conversions here; without it, the browser fallback pipelines are used.
"""
from __future__ import annotations

import os
import shutil
import tempfile
import traceback

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.background import BackgroundTask

from core import classify as C
from core import excel as E
from core import office as O
from core import pdfops as P
from core import word_out as W
from core.ocr import make_searchable_pdf

ENGINE_VERSION = "1.0.0"
HOST = "127.0.0.1"
PORT = 8712

app = FastAPI(title="ProPDF Engine", version=ENGINE_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # engine is loopback-only; origin is the local UI file
    allow_methods=["*"],
    allow_headers=["*"],
)


def _save_upload(f: UploadFile) -> str:
    suffix = os.path.splitext(f.filename or "file")[1] or ".bin"
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False,
                                      prefix="propdf_in_")
    with tmp as t:
        shutil.copyfileobj(f.file, t)
    return tmp.name


def _tmp_out(suffix: str) -> str:
    t = tempfile.NamedTemporaryFile(suffix=suffix, delete=False,
                                    prefix="propdf_out_")
    t.close()
    return t.name


def _file_response(path: str, name: str, extra: dict | None = None,
                   cleanup: list[str] | None = None):
    def _clean():
        for p in (cleanup or []) + [path]:
            try:
                os.unlink(p)
            except OSError:
                pass
    headers = {"X-ProPDF-Result": _json_header(extra or {})}
    return FileResponse(path, filename=name, headers=headers,
                        background=BackgroundTask(_clean))


def _json_header(d: dict) -> str:
    import json
    return json.dumps(d, default=str)[:7000]


def _err(e: Exception, status: int = 500):
    traceback.print_exc()
    msg = str(e) or e.__class__.__name__
    if isinstance(e, PermissionError):
        status = 401
        msg = "Password required or incorrect."
    return JSONResponse({"error": msg}, status_code=status)


@app.get("/health")
def health():
    return {
        "engine": "ProPDF Engine",
        "version": ENGINE_VERSION,
        "local_only": True,
        "office_available": O.office_available(),
        "capabilities": [
            "classify", "pdf2excel", "pdf2word", "office2pdf", "ocr_searchable",
            "protect", "unlock", "repair", "compress", "flatten",
            "strip_metadata", "extract_images", "crop", "resize", "deskew",
        ],
    }


@app.post("/classify")
async def classify(file: UploadFile = File(...), password: str = Form("")):
    src = _save_upload(file)
    try:
        prof = C.profile_pdf(src, password=password)
        return prof.to_dict()
    except Exception as e:
        return _err(e)
    finally:
        try:
            os.unlink(src)
        except OSError:
            pass


@app.post("/convert/excel")
async def convert_excel(file: UploadFile = File(...), langs: str = Form("eng"),
                        one_sheet: bool = Form(True), force_ocr: bool = Form(False),
                        password: str = Form("")):
    src = _save_upload(file)
    out = _tmp_out(".xlsx")
    try:
        info = E.convert_pdf_to_excel(src, out, langs=langs, one_sheet=one_sheet,
                                      force_ocr=force_ocr, password=password)
        name = os.path.splitext(file.filename or "output")[0] + ".xlsx"
        return _file_response(out, name, info, cleanup=[src])
    except Exception as e:
        for p in (src, out):
            try:
                os.unlink(p)
            except OSError:
                pass
        return _err(e)


@app.post("/convert/word")
async def convert_word(file: UploadFile = File(...), mode: str = Form("layout"),
                       langs: str = Form("eng")):
    src = _save_upload(file)
    out = _tmp_out(".docx")
    try:
        info = W.convert_pdf_to_word(src, out, mode=mode, langs=langs)
        name = os.path.splitext(file.filename or "output")[0] + ".docx"
        return _file_response(out, name, info, cleanup=[src])
    except Exception as e:
        for p in (src, out):
            try:
                os.unlink(p)
            except OSError:
                pass
        return _err(e)


@app.post("/convert/office2pdf")
async def office2pdf(file: UploadFile = File(...)):
    src = _save_upload(file)
    out = _tmp_out(".pdf")
    try:
        info = O.convert_office_to_pdf(src, out)
        name = os.path.splitext(file.filename or "output")[0] + ".pdf"
        return _file_response(out, name, info, cleanup=[src])
    except Exception as e:
        for p in (src, out):
            try:
                os.unlink(p)
            except OSError:
                pass
        return _err(e)


@app.post("/ocr/searchable")
async def ocr_searchable(file: UploadFile = File(...), langs: str = Form("eng"),
                         dpi: int = Form(300)):
    src = _save_upload(file)
    out = _tmp_out(".pdf")
    try:
        info = make_searchable_pdf(src, out, langs=langs, dpi=dpi)
        base = os.path.splitext(file.filename or "output")[0]
        return _file_response(out, base + "_searchable.pdf", info, cleanup=[src])
    except Exception as e:
        for p in (src, out):
            try:
                os.unlink(p)
            except OSError:
                pass
        return _err(e)


_SIMPLE_OPS = {
    "protect": (".pdf", lambda src, out, f: P.protect(
        src, out, user_pw=f.get("user_pw", ""), owner_pw=f.get("owner_pw", ""),
        allow_print=f.get("allow_print", "true") == "true",
        allow_copy=f.get("allow_copy", "false") == "true",
        allow_modify=f.get("allow_modify", "false") == "true")),
    "unlock": (".pdf", lambda src, out, f: P.unlock(src, out, f.get("password", ""))),
    "repair": (".pdf", lambda src, out, f: P.repair(src, out, f.get("password", ""))),
    "compress": (".pdf", lambda src, out, f: P.compress(src, out, f.get("preset", "ebook"))),
    "flatten": (".pdf", lambda src, out, f: P.flatten(src, out)),
    "strip-metadata": (".pdf", lambda src, out, f: P.strip_metadata(src, out)),
    "extract-images": (".zip", lambda src, out, f: P.extract_images(src, out)),
    "crop": (".pdf", lambda src, out, f: P.crop(
        src, out, float(f.get("top", 0)), float(f.get("right", 0)),
        float(f.get("bottom", 0)), float(f.get("left", 0)))),
    "resize": (".pdf", lambda src, out, f: P.resize_pages(
        src, out, f.get("size", "a4"), f.get("keep_ratio", "true") == "true")),
    "deskew": (".pdf", lambda src, out, f: P.deskew_pdf(src, out)),
}


@app.post("/tool/{op}")
async def tool(op: str, file: UploadFile = File(...), params: str = Form("{}")):
    import json

    if op not in _SIMPLE_OPS:
        return JSONResponse({"error": f"unknown tool {op}"}, status_code=404)
    suffix, fn = _SIMPLE_OPS[op]
    src = _save_upload(file)
    out = _tmp_out(suffix)
    try:
        form = json.loads(params or "{}")
        info = fn(src, out, form)
        base = os.path.splitext(file.filename or "output")[0]
        return _file_response(out, f"{base}_{op}{suffix}", info, cleanup=[src])
    except Exception as e:
        for p in (src, out):
            try:
                os.unlink(p)
            except OSError:
                pass
        return _err(e)


if __name__ == "__main__":
    import uvicorn
    print(f"ProPDF Engine v{ENGINE_VERSION} — local only, no uploads, "
          f"listening on http://{HOST}:{PORT}")
    uvicorn.run(app, host=HOST, port=PORT, log_level="warning")
