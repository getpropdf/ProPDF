/* ============================================================
   ProPDF — Engine bridge (local sidecar at 127.0.0.1:8712)
   Adds high-quality conversion routing + engine-backed tools.
   100% local: the engine binds to loopback only; no uploads.
   ============================================================ */
(function () {
  "use strict";
  var P = window.ProPDF;
  if (!P) return;
  var el = P.el;
  var BASE = "http://127.0.0.1:8712";

  var Engine = { available: false, info: null, probing: false };
  P.Engine = Engine;

  function fetchTimeout(url, opts, ms) {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, ms || 2000);
    opts = opts || {};
    opts.signal = ctrl.signal;
    return fetch(url, opts).finally(function () { clearTimeout(t); });
  }

  Engine.probe = function () {
    Engine.probing = true;
    return fetchTimeout(BASE + "/health", {}, 1800)
      .then(function (r) { return r.json(); })
      .then(function (j) {
        Engine.available = (j && j.engine === "ProPDF Engine");
        Engine.info = j;
        if (Engine.available) registerEngineTools();
        updatePill();
        return Engine.available;
      })
      .catch(function () {
        Engine.available = false;
        Engine.info = null;
        updatePill();
        return false;
      })
      .finally(function () { Engine.probing = false; });
  };

  /* POST a file to the engine; resolves {blob, filename, result} */
  Engine.call = function (path, file, fields, timeoutMs) {
    var fd = new FormData();
    fd.append("file", file, file.name);
    if (fields) {
      Object.keys(fields).forEach(function (k) { fd.append(k, fields[k]); });
    }
    return fetchTimeout(BASE + path, { method: "POST", body: fd }, timeoutMs || 1000 * 60 * 30)
      .then(function (r) {
        if (!r.ok) {
          return r.json().then(function (j) {
            throw new Error(j && j.error ? j.error : ("Engine error (" + r.status + ")"));
          }, function () { throw new Error("Engine error (" + r.status + ")"); });
        }
        var result = {};
        try { result = JSON.parse(r.headers.get("X-ProPDF-Result") || "{}"); } catch (e) {}
        var cd = r.headers.get("Content-Disposition") || "";
        var m = /filename="?([^";]+)"?/.exec(cd);
        return r.blob().then(function (b) {
          return { blob: b, filename: (m ? m[1] : null), result: result };
        });
      });
  };

  /* ---------------- header status pill ---------------- */
  function updatePill() {
    var pill = document.getElementById("enginePill");
    if (!pill) {
      var theme = document.getElementById("themeBtn");
      var host = theme ? theme.parentNode : document.querySelector(".topbar");
      if (!host) return;
      pill = el("span", { id: "enginePill" });
      pill.style.cssText = "font-size:11px;padding:3px 10px;border-radius:999px;margin-right:8px;cursor:pointer;white-space:nowrap;align-self:center;";
      host.insertBefore(pill, theme || host.firstChild);
      pill.onclick = function () { Engine.probe().then(function (ok) { P.toast(ok ? "ProPDF Power Pack connected." : "Power Pack not detected — the browser tools all work without it.", !ok); }); };
    }
    if (Engine.available) {
      pill.textContent = "⚡ Power Pack: on";
      pill.title = "ProPDF Engine connected (local-only, 127.0.0.1). High-quality conversions active.";
      pill.style.background = "rgba(46,160,67,.15)";
      pill.style.color = "#2ea043";
      pill.style.border = "1px solid rgba(46,160,67,.4)";
    } else {
      pill.textContent = "Power Pack: off";
      pill.title = "Optional local Power Pack not detected — every standard tool works right here in your browser. Offices can enable extras (Office→PDF, AES-256, repair, searchable OCR) via the engine folder in the download.";
      pill.style.background = "rgba(140,150,160,.12)";
      pill.style.color = "var(--muted, #8b949e)";
      pill.style.border = "1px solid rgba(140,150,160,.35)";
    }
  }

  /* ---------------- shared UI helpers ---------------- */
  function offlineNotice(panel, capability) {
    var box = el("div", { class: "note" });
    box.style.cssText = "border:1px solid rgba(210,153,34,.5);background:rgba(210,153,34,.08);padding:14px;border-radius:10px;margin:10px 0;font-size:13px;line-height:1.55;";
    box.innerHTML = "<strong>This tool runs on the free ProPDF Engine (local, offline).</strong><br>" +
      "The engine is not running right now, so this tool is unavailable — nothing is simulated.<br>" +
      "To enable it: open the <code>engine</code> folder and run <code>Install Engine (Windows).bat</code> once, " +
      "then <code>Start Engine.bat</code>. Your files never leave this computer — the engine listens on 127.0.0.1 only." +
      (capability ? "<br><em>Capability: " + capability + "</em>" : "");
    var retry = el("button", { class: "btn secondary" }, "Check again");
    retry.style.marginTop = "8px";
    retry.onclick = function () {
      Engine.probe().then(function (ok) {
        P.toast(ok ? "Engine connected — reopening tool." : "Still not reachable.", !ok);
        if (ok && currentToolId) P.go(currentToolId);
      });
    };
    box.appendChild(el("div"));
    box.appendChild(retry);
    panel.appendChild(box);
  }

  var currentToolId = null;

  function saveBlob(name, blob) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 4000);
  }

  function row(html) { return el("div", { class: "controls" }, html); }
  function field(label, inner) { return '<div class="field"><label>' + label + '</label>' + inner + '</div>'; }

  function actionUI(panel) {
    var prog = P.progressWidget();
    var res = P.resultWidget();
    panel.appendChild(prog.el);
    panel.appendChild(res.el);
    return { prog: prog, res: res };
  }

  /* Build a standard engine tool panel.
     cfg: { accept, hint, multiple, optionsHtml, buttonLabel, endpoint | run,
            fields(panel) -> object, describe(result) -> string, capability } */
  function enginePanel(panel, cfg) {
    if (!Engine.available) { offlineNotice(panel, cfg.capability); return; }
    var zone = P.fileZone({ multiple: !!cfg.multiple, accept: cfg.accept, hint: cfg.hint });
    panel.appendChild(zone.el);
    if (cfg.optionsHtml) panel.appendChild(row(cfg.optionsHtml));
    var io = actionUI(panel);
    var go = el("button", { class: "btn" }, cfg.buttonLabel || "Process ▸");
    panel.appendChild(el("div", { class: "btn-row" })).appendChild(go);
    go.onclick = function () {
      if (!zone.files.length) return P.toast("Add a file first", true);
      io.res.clear();
      io.prog.show("Processing locally in the ProPDF Engine…");
      io.prog.set(30, "Working — large files and OCR can take a few minutes…");
      go.disabled = true;
      var files = zone.files.slice();
      var idx = 0;
      function next() {
        if (idx >= files.length) {
          io.prog.hide();
          go.disabled = false;
          return;
        }
        var f = files[idx];
        var fields = cfg.fields ? cfg.fields(panel) : {};
        Engine.call(cfg.endpoint, f, fields).then(function (out) {
          saveBlob(out.filename || (f.name.replace(/\.[^.]+$/, "") + cfg.ext || ".out"), out.blob);
          io.prog.set(((idx + 1) / files.length) * 100, "Done " + (idx + 1) + " of " + files.length);
          var msg = cfg.describe ? cfg.describe(out.result, f) : "Done — file downloaded.";
          io.res.ok(msg);
          idx++;
          next();
        }).catch(function (e) {
          io.prog.hide();
          go.disabled = false;
          io.res.err("Engine: " + e.message);
        });
      }
      next();
    };
  }

  var OCR_LANGS =
    '<option value="eng">English</option><option value="hin">Hindi</option>' +
    '<option value="mar">Marathi</option><option value="hin+eng">Hindi + English</option>' +
    '<option value="mar+eng">Marathi + English</option><option value="guj">Gujarati</option>' +
    '<option value="tam">Tamil</option><option value="tel">Telugu</option>' +
    '<option value="kan">Kannada</option><option value="ben">Bengali</option>' +
    '<option value="pan">Punjabi</option>';

  /* Engine-backed tools are registered ONLY once the engine is detected, so
     web visitors (GitHub Pages) never see tool cards that can't work. */
  var engineToolsRegistered = false;
  function registerEngineTools() {
    if (engineToolsRegistered) return;
    engineToolsRegistered = true;
    /* ================= engine-backed tool registrations ================= */

    P.registerTool({
      id: "office2pdf", name: "Word / Excel / PPT → PDF", emoji: "🏢", group: "Convert to PDF", badge: "Engine",
      desc: "Layout-perfect Office → PDF (LibreOffice, local).",
      long: "Convert Word, Excel, PowerPoint, ODF, RTF and text files to professional PDFs using a local LibreOffice engine. Nothing is uploaded.",
      render: function (panel) {
        currentToolId = "office2pdf";
        if (Engine.available && Engine.info && !Engine.info.office_available) {
          var w = el("div", { class: "note" });
          w.style.cssText = "border:1px solid rgba(210,153,34,.5);padding:12px;border-radius:10px;margin:8px 0;font-size:13px;";
          w.innerHTML = "<strong>LibreOffice not found.</strong> This tool needs LibreOffice (free, local). Install from libreoffice.org, then restart the engine.";
          panel.appendChild(w);
          return;
        }
        enginePanel(panel, {
          capability: "Office → PDF via local LibreOffice",
          accept: ".doc,.docx,.odt,.rtf,.txt,.xls,.xlsx,.ods,.csv,.ppt,.pptx,.odp",
          hint: "Word / Excel / PowerPoint / ODF files", multiple: true,
          buttonLabel: "Convert to PDF ▸", endpoint: "/convert/office2pdf", ext: ".pdf",
          describe: function () { return "Converted with local LibreOffice — layout preserved."; }
        });
      }
    });

    P.registerTool({
      id: "protect", name: "Protect PDF (AES-256)", emoji: "🔐", group: "Optimize & Secure", badge: "Engine",
      desc: "Real AES-256 password encryption.",
      long: "Encrypt PDFs with AES-256 (the same standard banks use), with separate user/owner passwords and permission controls. Runs locally.",
      render: function (panel) {
        currentToolId = "protect";
        enginePanel(panel, {
          capability: "AES-256 encryption (pikepdf)",
          accept: "application/pdf,.pdf", hint: "one or more PDFs", multiple: true,
          optionsHtml:
            field("Open password", '<input id="ppw" type="password" placeholder="required to open">') +
            field("Owner password (optional)", '<input id="ppw2" type="password" placeholder="full-rights password">') +
            field("Allow printing", '<select id="pprint"><option value="true">Yes</option><option value="false">No</option></select>') +
            field("Allow copying text", '<select id="pcopy"><option value="false">No</option><option value="true">Yes</option></select>'),
          buttonLabel: "Encrypt ▸", endpoint: "/tool/protect", ext: ".pdf",
          fields: function () {
            var pw = document.getElementById("ppw").value;
            if (!pw) { P.toast("Set an open password", true); throw new Error("no password"); }
            return { params: JSON.stringify({ user_pw: pw, owner_pw: document.getElementById("ppw2").value, allow_print: document.getElementById("pprint").value, allow_copy: document.getElementById("pcopy").value }) };
          },
          describe: function (r) { return "Encrypted with " + (r.encryption || "AES-256") + "."; }
        });
      }
    });

    P.registerTool({
      id: "repair", name: "Repair PDF", emoji: "🩹", group: "Optimize & Secure", badge: "Engine",
      desc: "Fix damaged / corrupted PDFs.",
      long: "Rebuilds broken cross-reference tables and structure using pikepdf, with a Ghostscript deep-rebuild fallback for badly damaged files.",
      render: function (panel) {
        currentToolId = "repair";
        enginePanel(panel, {
          capability: "structure repair (pikepdf + Ghostscript)",
          accept: "application/pdf,.pdf", hint: "a damaged PDF", multiple: true,
          buttonLabel: "Repair ▸", endpoint: "/tool/repair", ext: ".pdf",
          describe: function (r) { return "Repaired (engine: " + (r.engine || "pikepdf") + ")."; }
        });
      }
    });

    P.registerTool({
      id: "searchocr", name: "Make Searchable PDF", emoji: "🔍", group: "OCR & Data", badge: "Engine",
      desc: "Add invisible OCR text layer to scans.",
      long: "Turns scanned PDFs into searchable PDFs: the page image stays identical, and an invisible OCR text layer is added underneath so you can search, select and copy. Auto-corrects rotated pages.",
      render: function (panel) {
        currentToolId = "searchocr";
        enginePanel(panel, {
          capability: "searchable PDF (Tesseract text layer)",
          accept: "application/pdf,.pdf", hint: "scanned PDF", multiple: false,
          optionsHtml: field("Language", '<select id="soLang">' + OCR_LANGS + "</select>"),
          buttonLabel: "Create searchable PDF ▸", endpoint: "/ocr/searchable", ext: ".pdf",
          fields: function () { return { langs: document.getElementById("soLang").value }; },
          describe: function (r) {
            return "Searchable PDF created (" + r.pages + " pages" +
              (r.mean_confidence ? ", OCR confidence " + r.mean_confidence + "%" : "") + ")." +
              (r.mean_confidence && r.mean_confidence < 80 ? " ⚠️ Low confidence — verify important text." : "");
          }
        });
      }
    });

    P.registerTool({
      id: "flatten", name: "Flatten PDF", emoji: "🫓", group: "Optimize & Secure", badge: "Engine",
      desc: "Bake forms & annotations into the page.",
      long: "Permanently merges form fields, signatures appearances and annotations into the page content so they can no longer be edited — important before sharing filled forms.",
      render: function (panel) {
        currentToolId = "flatten";
        enginePanel(panel, {
          capability: "form/annotation flattening",
          accept: "application/pdf,.pdf", hint: "PDF with forms/annotations", multiple: true,
          buttonLabel: "Flatten ▸", endpoint: "/tool/flatten", ext: ".pdf",
          describe: function () { return "Flattened — interactive elements baked into page content."; }
        });
      }
    });

    P.registerTool({
      id: "stripmeta", name: "Remove Metadata", emoji: "🧹", group: "Optimize & Secure", badge: "DPDP",
      desc: "Strip author, software & hidden info.",
      long: "Removes document information (author, creator software, timestamps) and XMP metadata — useful before sharing files outside the office.",
      render: function (panel) {
        currentToolId = "stripmeta";
        enginePanel(panel, {
          capability: "metadata removal",
          accept: "application/pdf,.pdf", hint: "one or more PDFs", multiple: true,
          buttonLabel: "Remove metadata ▸", endpoint: "/tool/strip-metadata", ext: ".pdf",
          describe: function () { return "Document info and XMP metadata removed."; }
        });
      }
    });

    P.registerTool({
      id: "eximgs", name: "Extract Images", emoji: "🖼️", group: "Convert from PDF", badge: "Engine",
      desc: "Pull all embedded images to a ZIP.",
      long: "Extracts every embedded image from the PDF at original quality into a ZIP file.",
      render: function (panel) {
        currentToolId = "eximgs";
        enginePanel(panel, {
          capability: "image extraction",
          accept: "application/pdf,.pdf", hint: "one PDF", multiple: false,
          buttonLabel: "Extract images ▸", endpoint: "/tool/extract-images", ext: ".zip",
          describe: function (r) { return "Extracted " + (r.images || 0) + " image(s) to ZIP."; }
        });
      }
    });

    P.registerTool({
      id: "croppdf", name: "Crop PDF", emoji: "✂️", group: "Organize", badge: "Engine",
      desc: "Trim margins on every page.",
      long: "Crop uniform margins from all pages (values in points; 72 pt = 1 inch, 28.35 pt = 1 cm).",
      render: function (panel) {
        currentToolId = "croppdf";
        enginePanel(panel, {
          capability: "page cropping",
          accept: "application/pdf,.pdf", hint: "one PDF", multiple: false,
          optionsHtml:
            field("Top (pt)", '<input id="crT" type="number" value="0">') +
            field("Right (pt)", '<input id="crR" type="number" value="0">') +
            field("Bottom (pt)", '<input id="crB" type="number" value="0">') +
            field("Left (pt)", '<input id="crL" type="number" value="0">'),
          buttonLabel: "Crop ▸", endpoint: "/tool/crop", ext: ".pdf",
          fields: function () {
            return { params: JSON.stringify({ top: document.getElementById("crT").value || 0, right: document.getElementById("crR").value || 0, bottom: document.getElementById("crB").value || 0, left: document.getElementById("crL").value || 0 }) };
          },
          describe: function (r) { return "Cropped " + (r.cropped_pages || "all") + " page(s)."; }
        });
      }
    });

    P.registerTool({
      id: "resize", name: "Page Size Converter", emoji: "📐", group: "Organize", badge: "Engine",
      desc: "Convert pages to A4 / Letter / Legal…",
      long: "Rescales every page onto a standard page size while keeping proportions — fixes mixed-size documents before printing or filing.",
      render: function (panel) {
        currentToolId = "resize";
        enginePanel(panel, {
          capability: "page size conversion",
          accept: "application/pdf,.pdf", hint: "one PDF", multiple: false,
          optionsHtml: field("Target size", '<select id="rsSize"><option value="a4">A4</option><option value="letter">Letter</option><option value="legal">Legal</option><option value="a3">A3</option><option value="a5">A5</option></select>'),
          buttonLabel: "Convert size ▸", endpoint: "/tool/resize", ext: ".pdf",
          fields: function () { return { params: JSON.stringify({ size: document.getElementById("rsSize").value }) }; },
          describe: function (r) { return "Converted " + r.pages + " page(s) to " + String(r.size).toUpperCase() + "."; }
        });
      }
    });

    P.registerTool({
      id: "deskew", name: "Deskew & Auto-Rotate Scans", emoji: "📏", group: "OCR & Data", badge: "Engine",
      desc: "Straighten tilted / rotated scans.",
      long: "Detects rotated (90/180/270°) and tilted scanned pages and corrects them automatically — makes OCR and reading dramatically better.",
      render: function (panel) {
        currentToolId = "deskew";
        enginePanel(panel, {
          capability: "deskew + orientation fix (OpenCV + Tesseract OSD)",
          accept: "application/pdf,.pdf", hint: "scanned PDF", multiple: false,
          buttonLabel: "Straighten ▸", endpoint: "/tool/deskew", ext: ".pdf",
          describe: function (r) { return "Checked " + r.pages + " page(s); corrected " + r.corrected + "."; }
        });
      }
    });

    if (P.current === "home" && P.go) P.go("home");
  }

  /* ============ upgrade existing tools when engine is present ============ */

  function overrideTool(id, wrap) {
    var t = P.getTool ? P.getTool(id) : null;
    if (!t && window.ProPDF && window.ProPDF.tools) {
      t = window.ProPDF.tools.filter(function (x) { return x.id === id; })[0];
    }
    if (!t) return;
    var orig = t.render;
    t.render = function (panel) { wrap(panel, orig); };
  }

  /* PDF → Excel: engine mode with validation report */
  overrideTool("pdf2excel", function (panel, orig) {
    currentToolId = "pdf2excel";
    if (!Engine.available) { orig(panel); return; }
    var b = el("div");
    b.style.cssText = "font-size:12px;margin:4px 0 10px;padding:8px 12px;border-radius:8px;background:rgba(46,160,67,.1);border:1px solid rgba(46,160,67,.35);";
    b.innerHTML = "⚡ <strong>Engine mode:</strong> document classification → best-engine table extraction → semantic reconstruction → numeric validation. All local.";
    panel.appendChild(b);
    enginePanel(panel, {
      capability: "PDF → Excel (flagship)",
      accept: "application/pdf,.pdf", hint: "text or scanned PDF (auto-OCR)", multiple: false,
      optionsHtml:
        field("Layout", '<select id="exSheets"><option value="true">One sheet (combined)</option><option value="false">One sheet per page</option></select>') +
        field("If scanned, OCR language", '<select id="exLang">' + OCR_LANGS + "</select>") +
        field("Mode", '<select id="exForce"><option value="false">Auto-detect (OCR only if needed)</option><option value="true">Force OCR</option></select>'),
      buttonLabel: "Extract to Excel ▸", endpoint: "/convert/excel", ext: ".xlsx",
      fields: function () {
        return {
          one_sheet: document.getElementById("exSheets").value,
          langs: document.getElementById("exLang").value,
          force_ocr: document.getElementById("exForce").value
        };
      },
      describe: function (r) {
        var msg = "Detected: <strong>" + (r.doc_type_label || "document") + "</strong> — extracted " + r.rows + " row(s) from " + r.pages + " page(s).";
        if (r.mode === "bank_statement") {
          msg += "<br>Semantic statement reconstruction: totals Dr " + r.total_debits + " / Cr " + r.total_credits +
            ", balance-continuity confidence <strong>" + r.continuity_confidence + "%</strong>.";
          if (r.continuity_failed_rows && r.continuity_failed_rows.length) {
            msg += "<br>⚠️ " + r.continuity_failed_rows.length + " row(s) flagged — see the red rows and the Validation sheet.";
          } else {
            msg += " ✔ Every row passed the balance check.";
          }
        }
        if (r.ocr_pages) {
          msg += "<br>OCR used on " + r.ocr_pages + " page(s), confidence " + (r.mean_ocr_confidence || "n/a") + "%." +
            (r.mean_ocr_confidence && r.mean_ocr_confidence < 80 ? " ⚠️ Verify numbers against the source." : "");
        }
        (r.warnings || []).forEach(function (w) { msg += "<br>⚠️ " + w; });
        return msg;
      }
    });
  });

  /* PDF → Word: engine mode produces real .docx */
  overrideTool("pdf2word", function (panel, orig) {
    currentToolId = "pdf2word";
    if (!Engine.available) {
      var hint = el("div", { class: "note" });
      hint.style.cssText = "font-size:12px;opacity:.85;margin:4px 0 10px;padding:10px;border:1px dashed rgba(140,150,160,.4);border-radius:8px;";
      hint.innerHTML = "💡 This browser fallback produces a simple Word-openable <code>.doc</code> (text only). Start the <strong>ProPDF Engine</strong> for true <code>.docx</code> with layout, tables and images.";
      panel.appendChild(hint);
      orig(panel);
      return;
    }
    var b = el("div");
    b.style.cssText = "font-size:12px;margin:4px 0 10px;padding:8px 12px;border-radius:8px;background:rgba(46,160,67,.1);border:1px solid rgba(46,160,67,.35);";
    b.innerHTML = "⚡ <strong>Engine mode:</strong> real .docx output with layout reconstruction, tables and images. Scanned pages are OCR'd automatically.";
    panel.appendChild(b);
    enginePanel(panel, {
      capability: "PDF → Word (.docx)",
      accept: "application/pdf,.pdf", hint: "text or scanned PDF", multiple: false,
      optionsHtml:
        field("Mode", '<select id="wdMode"><option value="layout">Layout preservation (closest to original)</option><option value="editable">Editable (clean paragraphs & headings)</option></select>') +
        field("If scanned, OCR language", '<select id="wdLang">' + OCR_LANGS + "</select>"),
      buttonLabel: "Convert to Word ▸", endpoint: "/convert/word", ext: ".docx",
      fields: function () {
        return { mode: document.getElementById("wdMode").value, langs: document.getElementById("wdLang").value };
      },
      describe: function (r) {
        var msg = "Converted to .docx (" + (r.mode === "layout" ? "layout preservation" : "editable") + " mode).";
        if (r.ocr_pages) msg += "<br>OCR used on " + r.ocr_pages + " page(s)" + (r.mean_ocr_confidence ? ", confidence " + r.mean_ocr_confidence + "%" : "") + ".";
        return msg;
      }
    });
  });

  /* Compress: prefer engine (much better ratios, quality presets) */
  overrideTool("compress", function (panel, orig) {
    currentToolId = "compress";
    if (!Engine.available) { orig(panel); return; }
    var b = el("div");
    b.style.cssText = "font-size:12px;margin:4px 0 10px;padding:8px 12px;border-radius:8px;background:rgba(46,160,67,.1);border:1px solid rgba(46,160,67,.35);";
    b.innerHTML = "⚡ <strong>Engine mode:</strong> scan-aware recompression with quality presets (Ghostscript-class for text PDFs).";
    panel.appendChild(b);
    enginePanel(panel, {
      capability: "high-ratio compression",
      accept: "application/pdf,.pdf", hint: "one or more PDFs", multiple: true,
      optionsHtml: field("Quality", '<select id="cmPreset"><option value="ebook">Balanced (recommended)</option><option value="printer">Light (best quality)</option><option value="screen">Strong (smallest)</option></select>'),
      buttonLabel: "Compress ▸", endpoint: "/tool/compress", ext: ".pdf",
      fields: function () { return { params: JSON.stringify({ preset: document.getElementById("cmPreset").value }) }; },
      describe: function (r) {
        var mb = function (x) { return (x / 1048576).toFixed(2) + " MB"; };
        return "Compressed " + mb(r.before) + " → " + mb(r.after) + " (" + r.saved_pct + "% smaller, engine: " + r.engine + ").";
      }
    });
  });

  /* Unlock: use engine when a real user password must be removed */
  overrideTool("unlock", function (panel, orig) {
    currentToolId = "unlock";
    orig(panel);
    if (Engine.available) {
      var b = el("div");
      b.style.cssText = "font-size:12px;margin:10px 0 0;padding:8px 12px;border-radius:8px;background:rgba(46,160,67,.08);border:1px solid rgba(46,160,67,.3);";
      b.innerHTML = "⚡ Engine detected — password-protected files are fully decrypted (AES included) when you enter the correct password.";
      panel.appendChild(b);
    }
  });

  /* ---------------- boot ---------------- */
  function boot() {
    Engine.probe();
    setInterval(function () { if (!Engine.available) Engine.probe(); }, 20000);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
