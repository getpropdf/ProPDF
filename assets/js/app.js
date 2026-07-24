/* ============================================================
   ProPDF — UI shell & utilities
   Prepared by Kothari Jain & Associates
   ============================================================ */
(function () {
  "use strict";

  var App = {
    tools: [],
    groups: ["Convert to PDF", "Convert from PDF", "Organize", "Optimize & Secure", "OCR & Data", "Review & Compare"],
    current: "home"
  };

  /* ---------------- tool registry ---------------- */
  App.registerTool = function (def) { App.tools.push(def); };
  App.getTool = function (id) { return App.tools.filter(function (t) { return t.id === id; })[0]; };

  /* ---------------- DOM helpers ---------------- */
  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "class") e.className = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    if (html != null) e.innerHTML = html;
    return e;
  }
  App.el = el;

  /* ---------------- theme ---------------- */
  App.toggleTheme = function () {
    var html = document.documentElement;
    var next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
    html.setAttribute("data-theme", next);
    document.getElementById("themeBtn").textContent = next === "dark" ? "☀️" : "🌙";
    try { window.localStorage.setItem("propdf-theme", next); } catch (e) {}
  };
  (function initTheme() {
    var saved;
    try { saved = window.localStorage.getItem("propdf-theme"); } catch (e) {}
    if (saved) {
      document.documentElement.setAttribute("data-theme", saved);
    }
  })();

  /* ---------------- toast ---------------- */
  var toastTimer;
  App.toast = function (msg, isErr) {
    var t = document.getElementById("toast");
    t.textContent = msg;
    t.className = "toast show" + (isErr ? " err" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = "toast"; }, 3800);
  };

  /* ---------------- file helpers ---------------- */
  App.readAB = function (file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = rej;
      r.readAsArrayBuffer(file);
    });
  };
  App.fmtSize = function (b) {
    if (b < 1024) return b + " B";
    if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
    return (b / 1048576).toFixed(2) + " MB";
  };
  App.download = function (filename, data, mime) {
    var blob = (data instanceof Blob) ? data : new Blob([data], { type: mime || "application/octet-stream" });
    var url = URL.createObjectURL(blob);
    var a = el("a", { href: url, download: filename });
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  };

  /* ---------------- reusable file zone ----------------
     opts: { multiple, accept, hint, onChange(files) }
     returns { files: [], el, refresh() }
  ---------------------------------------------------- */
  App.fileZone = function (opts) {
    opts = opts || {};
    var state = { files: [] };
    var wrap = el("div");
    var dz = el("div", { class: "dropzone" });
    dz.innerHTML =
      '<div class="dz-icon">📂</div>' +
      '<h4>Drag &amp; drop files here</h4>' +
      '<p>' + (opts.hint || "or click to browse") + '</p>';
    var input = el("input", { type: "file", style: "display:none" });
    if (opts.multiple) input.setAttribute("multiple", "multiple");
    if (opts.accept) input.setAttribute("accept", opts.accept);
    var list = el("div", { class: "filelist" });
    var previewWrap = el("div", { class: "preview-wrap" });

    function add(fileList) {
      var arr = Array.prototype.slice.call(fileList);
      if (!opts.multiple) { state.files = arr.slice(0, 1); }
      else { state.files = state.files.concat(arr); }
      render();
      if (opts.onChange) opts.onChange(state.files);
    }
    function render() {
      list.innerHTML = "";
      state.files.forEach(function (f, i) {
        var item = el("div", { class: "fileitem", draggable: opts.multiple ? "true" : "false" });
        item.innerHTML =
          (opts.multiple ? '<span class="grip">⠿</span>' : '') +
          '<span class="fname">' + escapeHtml(f.name) + '</span>' +
          '<span class="fsize">' + App.fmtSize(f.size) + '</span>' +
          '<span class="rm" title="Remove">✕</span>';
        item.querySelector(".rm").onclick = function () {
          state.files.splice(i, 1); render();
          if (opts.onChange) opts.onChange(state.files);
        };
        if (opts.multiple) enableRowDrag(item, i);
        list.appendChild(item);
      });
      renderPreview();
    }
    function enableRowDrag(item, idx) {
      item.addEventListener("dragstart", function (e) {
        item.classList.add("dragging");
        e.dataTransfer.setData("text/plain", idx);
      });
      item.addEventListener("dragend", function () { item.classList.remove("dragging"); });
      item.addEventListener("dragover", function (e) { e.preventDefault(); });
      item.addEventListener("drop", function (e) {
        e.preventDefault();
        var from = parseInt(e.dataTransfer.getData("text/plain"), 10);
        if (isNaN(from) || from === idx) return;
        var moved = state.files.splice(from, 1)[0];
        state.files.splice(idx, 0, moved);
        render();
        if (opts.onChange) opts.onChange(state.files);
      });
    }

    dz.onclick = function () { input.click(); };
    input.onchange = function () { add(input.files); input.value = ""; };
    dz.addEventListener("dragover", function (e) { e.preventDefault(); dz.classList.add("drag"); });
    dz.addEventListener("dragleave", function () { dz.classList.remove("drag"); });
    dz.addEventListener("drop", function (e) {
      e.preventDefault(); dz.classList.remove("drag");
      if (e.dataTransfer.files && e.dataTransfer.files.length) add(e.dataTransfer.files);
    });

    wrap.appendChild(dz);
    wrap.appendChild(input);
    wrap.appendChild(list);
    wrap.appendChild(previewWrap);
    state.el = wrap;
    state.clear = function () { state.files = []; render(); };

    function isPdf(f) { return /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name); }
    function isImg(f) { return /^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name); }
    var previewToken = 0;
    function renderPreview() {
      if (opts.preview === false) return;
      previewWrap.innerHTML = "";
      if (!state.files.length) return;
      if (!state.files.some(function (f) { return isPdf(f) || isImg(f); })) return;
      var myToken = ++previewToken;
      previewWrap.appendChild(el("div", { class: "preview-head" }, "Preview"));
      var box = el("div"); previewWrap.appendChild(box);
      var MAX = 60, shown = 0, multi = state.files.length > 1;
      var needPdf = state.files.some(isPdf);
      var prep = (needPdf && window.ProPDFLibs) ? window.ProPDFLibs.ensure("pdfjs") : Promise.resolve();
      prep.then(function () {
        return state.files.reduce(function (chain, f) {
          return chain.then(function () {
            if (myToken !== previewToken) return;
            if (multi) box.appendChild(el("div", { class: "preview-file-label" }, "📄 " + escapeHtml(f.name)));
            if (isImg(f)) {
              var gi = el("div", { class: "thumbs" }); box.appendChild(gi);
              var ti = el("div", { class: "thumb" });
              var im = el("img"); im.src = URL.createObjectURL(f); ti.appendChild(im); gi.appendChild(ti);
              shown++; return;
            }
            if (!isPdf(f)) return;
            return App.readAB(f).then(function (ab) {
              return window.pdfjsLib.getDocument({ data: ab }).promise.then(function (pdf) {
                var g = el("div", { class: "thumbs" }); box.appendChild(g);
                var n = pdf.numPages, i = 1;
                function nextPage() {
                  if (i > n || shown >= MAX || myToken !== previewToken) {
                    if (n > MAX) box.appendChild(el("div", { class: "muted", style: "margin:8px 2px;font-size:12.5px" }, "Showing first " + MAX + " of " + n + " pages."));
                    return;
                  }
                  return pdf.getPage(i).then(function (pg) {
                    var vp = pg.getViewport({ scale: 0.3 });
                    var t = el("div", { class: "thumb" });
                    var c = el("canvas"); c.width = vp.width; c.height = vp.height;
                    t.appendChild(c); t.appendChild(el("div", { class: "pg" }, "Page " + i));
                    g.appendChild(t);
                    return pg.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise.then(function () { shown++; i++; return nextPage(); });
                  });
                }
                return nextPage();
              });
            });
          });
        }, Promise.resolve());
      }).catch(function () {});
    }

    return state;
  };

  /* ---------------- progress + result widgets ---------------- */
  App.progressWidget = function () {
    var wrap = el("div", { class: "progress-wrap" });
    wrap.innerHTML =
      '<div class="progress-bar"><div class="progress-fill"></div></div>' +
      '<div class="progress-label"></div>';
    var fill = wrap.querySelector(".progress-fill");
    var label = wrap.querySelector(".progress-label");
    return {
      el: wrap,
      show: function (msg) { wrap.classList.add("show"); if (msg) label.textContent = msg; },
      set: function (pct, msg) { fill.style.width = Math.max(0, Math.min(100, pct)) + "%"; if (msg != null) label.textContent = msg; },
      hide: function () { wrap.classList.remove("show"); fill.style.width = "0%"; }
    };
  };
  App.resultWidget = function () {
    var w = el("div", { class: "result" });
    return {
      el: w,
      ok: function (msg) { w.className = "result show ok"; w.innerHTML = msg; },
      err: function (msg) { w.className = "result show err"; w.innerHTML = "⚠️ " + msg; },
      clear: function () { w.className = "result"; w.innerHTML = ""; }
    };
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  App.escapeHtml = escapeHtml;

  /* parse page ranges like "1-3,5,8-10" into 0-based index array */
  App.parseRanges = function (str, max) {
    var out = [], seen = {};
    String(str).split(",").forEach(function (part) {
      part = part.trim(); if (!part) return;
      var m = part.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) {
        var a = parseInt(m[1], 10), b = parseInt(m[2], 10);
        if (a > b) { var t = a; a = b; b = t; }
        for (var i = a; i <= b; i++) push(i);
      } else if (/^\d+$/.test(part)) {
        push(parseInt(part, 10));
      }
    });
    function push(n) { if (n >= 1 && n <= max && !seen[n]) { seen[n] = 1; out.push(n - 1); } }
    return out;
  };

  /* ---------------- navigation / rendering ---------------- */
  App.go = function (id) {
    App.current = id;
    renderSidebar();
    var main = document.getElementById("main");
    main.innerHTML = "";
    window.scrollTo(0, 0);
    if (id === "home") return renderHome(main);
    if (id === "changelog") return renderChangelog(main);
    var tool = App.getTool(id);
    if (!tool) return renderHome(main);
    if (App.track) App.track("tool/" + id, "Tool: " + tool.name);

    var head = el("div");
    head.innerHTML =
      '<div class="tool-head"><span class="back" onclick="ProPDF.go(\'home\')">← All tools</span></div>' +
      '<div class="tool-head"><span style="font-size:26px">' + tool.emoji + '</span><h2>' + tool.name + '</h2>' +
      (tool.status === "soon" ? ' <span class="pill" style="background:rgba(201,133,27,.16);color:var(--warning)">Roadmap</span>' : '') +
      '</div>' +
      '<p class="tool-sub">' + tool.long + '</p>';
    main.appendChild(head);

    var panel = el("div", { class: "panel" });
    main.appendChild(panel);
    if (tool.status === "soon" && !tool.render) {
      panel.innerHTML = '<p class="muted">This capability is planned for the optional ProPDF Power Pack (local Python engine). ' +
        'See the roadmap in <code>docs/ROADMAP.md</code>. The lean browser edition focuses on features that run fully client-side.</p>';
      return;
    }
    try { tool.render(panel); }
    catch (e) { panel.innerHTML = '<p class="result show err">Failed to load tool: ' + escapeHtml(e.message) + '</p>'; }
  };

  function renderSidebar() {
    var sb = document.getElementById("sidebar");
    sb.innerHTML = "";
    var home = el("div", { class: "side-link" + (App.current === "home" ? " active" : "") }, '<span class="ic">🏠</span> Home');
    home.onclick = function () { App.go("home"); };
    sb.appendChild(home);
    App.groups.forEach(function (g) {
      sb.appendChild(el("div", { class: "side-group-title" }, g));
      App.tools.filter(function (t) { return t.group === g; }).forEach(function (t) {
        var link = el("div", { class: "side-link" + (App.current === t.id ? " active" : "") },
          '<span class="ic">' + t.emoji + '</span> ' + t.name);
        link.onclick = function () { App.go(t.id); };
        sb.appendChild(link);
      });
    });
    sb.appendChild(el("div", { class: "side-group-title" }, "About"));
    var cl = el("div", { class: "side-link" + (App.current === "changelog" ? " active" : "") }, '<span class="ic">\ud83d\udd52</span> Changelog');
    cl.onclick = function () { App.go("changelog"); };
    sb.appendChild(cl);
  }

  var CHANGELOG = [
    { v: "v10.6", title: "PDF \u2192 Excel works on any bank statement + password prompt", items: [
      "Rebuilt the table engine so PDF \u2192 Excel reads almost any bank statement layout \u2014 ruled grids, partly-ruled, and completely borderless ones. Columns are detected once across the whole document so every page lines up, and wrapped multi-line entries are merged into a single transaction row using a date anchor. Tested across HDFC, ICICI, SBI, IDBI, Federal, South Indian Bank and Bank of Baroda formats.",
      "Password-protected PDFs now prompt for the password before any tool runs, and the file is unlocked in memory \u2014 no more blank output. Applies to every tool (Excel, Word, merge, split, rotate, compress, watermark, page numbers, redact and more)."
    ] },
    { v: "v10.5", title: "PDF \u2192 Excel \u2014 true grid extraction + sheet layout", items: [
      "PDF \u2192 Excel now reads the table as a true grid: it detects both the horizontal and vertical ruled lines and drops every word into its exact cell. Multi-line entries (like wrapped bank-statement transactions) now stay in one row on every page \u2014 fixing the earlier bug where the first rows of later pages were dumped into a single column, and a stray extra column that shifted some pages.",
      "New Layout choice: export all pages into one combined sheet (default) or one sheet per page.",
      "Repeated column headers on later pages are removed automatically in combined mode."
    ] },
    { v: "v10.4", title: "Much better PDF \u2192 Excel", items: [
      "PDF \u2192 Excel now detects the table's ruled lines for exact column splits, groups multi-line rows (e.g. bank-statement transactions) into a single row, and keeps amounts as numbers. Borderless tables use smart whitespace detection. A big jump in accuracy on real statements."
    ] },
    { v: "v10.3", title: "Fix — Redaction preview shows full pages", items: [
      "Redact: the preview is now a single scrollable area showing every page at full height — scroll down through all pages and draw redaction boxes anywhere. (Multi-page PDFs previously shrank each page to a thin strip.)"
    ] },
    { v: "v10.2", title: "Fix — Redaction page preview", items: [
      "Redact: the page preview now shows each page at full size (previously multi-page PDFs collapsed to a thin strip), so you can clearly see every page and draw redaction boxes anywhere.",
      "Hardened the Compare visual-diff preview sizing too."
    ] },
    { v: "v10.1", title: "Fixes — Redaction detect & Interactive Overlay", items: [
      "Redact: auto-detect now catches sensitive values split across text fragments (e.g. PAN, account numbers, emails) in iText / government PDFs — previously some were missed.",
      "Overlay / Letterhead: redesigned with on-screen handles — drag to move, corner ◢ to resize, top ⟳ to rotate — with a live preview, instead of typing numbers."
    ] },
    { v: "v10", title: "Redaction, Overlay, Compare & OCR Workbench", items: [
      "Redact PDF: auto-detects sensitive data (PAN, GSTIN, TAN, CIN, DIN, IFSC, Aadhaar, card/account numbers, emails, phones) and lets you draw redaction boxes. Redacted pages are permanently flattened so hidden text cannot be recovered; works on scans via OCR; output is verified.",
      "Overlay / Letterhead: stamp a letterhead, logo, sign or stamp (PDF/PNG/JPG) over chosen pages with position, size, rotation, opacity and live preview.",
      "Compare PDFs: text differences (added/removed/changed) and visual pixel differences, with an exportable report; auto-OCR for scanned files.",
      "OCR Workbench: review and correct OCR text, validate PAN/GSTIN/Aadhaar/CIN/IFSC by checksum, and export to TXT, Word, Excel or a searchable PDF (image + invisible selectable text)."
    ] },
    { v: "v9", title: "Compress to a target size", items: [
      "Compress PDF now has a \u201cTarget file size\u201d mode \u2014 enter a limit in KB or MB (e.g. for GST / Income-Tax portals) and ProPDF automatically finds the best quality and resolution that stays under it.",
      "Tells you the final size, and warns if the target is impossible without unreadable quality."
    ] },
    { v: "v8", title: "Cleanup & Changelog", items: [
      "Removed the non-working Office → PDF and Password Protect placeholders.",
      "Added this Changelog with the full version history."
    ] },
    { v: "v7", title: "File previews", items: [
      "Page-thumbnail previews of the attached file in every tool (Split / Extract, Merge, Rotate, Compress, Watermark, Page Numbers, and all PDF → tools), each page numbered.",
      "Merge shows each file's pages grouped under its name, in the current order.",
      "Images → PDF previews the actual images before converting."
    ] },
    { v: "v6", title: "Far better PDF → Excel tables", items: [
      "Columns are now anchored to the table's header row and each word is placed by position — so Client ID, Client Name, quantities and ISIN stay in their own columns even when names are long.",
      "The table is automatically separated from the letterhead and signature text.",
      "Rows whose content wrapped to a second line are merged back together; trailing rows are detected via their numeric columns.",
      "Quantities saved as numbers; long IDs kept as text to avoid losing digits."
    ] },
    { v: "v5", title: "Automatic OCR for scans", items: [
      "PDF → Excel now detects a scanned page (no text layer) and runs OCR automatically — no separate step.",
      "OCR reads word positions via TSV with confidence filtering, and never produces a blank sheet.",
      "The same auto-OCR fallback was added to PDF → Text and PDF → Word.",
      "Added a per-tool OCR language selector (English plus Hindi, Marathi, Gujarati, Tamil, Telugu, Kannada, Bengali, Punjabi)."
    ] },
    { v: "v4", title: "One shareable file", items: [
      "Repackaged the whole app into a single self-contained index.html — share just that one file.",
      "Fixed start-up and file:// loading problems; added a cache-proof local launcher (Start ProPDF.bat)."
    ] },
    { v: "v3", title: "Modern redesign", items: [
      "New Material + Glassmorphism interface: frosted-glass panels, animated gradient background, refined dark / light themes and hover effects."
    ] },
    { v: "v2", title: "Stability fix", items: [
      "Fixed a critical bug where the tools failed to load, leaving buttons unresponsive — everything is clickable now."
    ] },
    { v: "v1", title: "First release", items: [
      "100% local, DPDP-aligned PDF suite — no uploads, no cloud, no telemetry.",
      "Convert to PDF (Images, Text / CSV) and from PDF (JPG/PNG, Text, HTML, Word, Excel).",
      "Organize: Merge, Split / Extract, Rotate, Organize Pages.",
      "Optimize & Secure: Compress, Watermark, Page Numbers, Unlock.",
      "OCR (English + 10 Indian languages) and Smart Data Extract (PAN / GSTIN / TAN / CIN / DIN).",
      "Dark / light mode, drag-and-drop, search and full documentation."
    ] }
  ];

  function renderChangelog(main) {
    var hero = el("div", { class: "hero" });
    hero.innerHTML = '<h1>Changelog</h1><p>Version history of ProPDF — newest first. Current version: <strong>' + CHANGELOG[0].v + '</strong>.</p>';
    main.appendChild(hero);
    CHANGELOG.forEach(function (rel) {
      var card = el("div", { class: "panel" });
      var items = rel.items.map(function (it) { return '<li>' + escapeHtml(it) + '</li>'; }).join("");
      card.innerHTML = '<div class="cl-head"><span class="cl-ver">' + rel.v + '</span><span class="cl-title">' + escapeHtml(rel.title) + '</span></div><ul class="cl-list">' + items + '</ul>';
      main.appendChild(card);
    });
  }

  function renderHome(main) {
    var hero = el("div", { class: "hero" });
    hero.innerHTML =
      '<h1>Professional PDF Tools. Your Data Never Leaves Your Office.</h1>' +
      '<p>A complete, DPDP-aligned PDF suite that runs entirely on your computer — no uploads, no cloud, ' +
      'no telemetry. Built for Chartered Accountants, advocates, consultants and SMEs by ' +
      '<strong>Kothari Jain &amp; Associates</strong>. Free to use and share.</p>';
    main.appendChild(hero);

    var q = (document.getElementById("toolSearch").value || "").toLowerCase();
    App.groups.forEach(function (g) {
      var items = App.tools.filter(function (t) {
        return t.group === g && (!q || (t.name + " " + t.long).toLowerCase().indexOf(q) !== -1);
      });
      if (!items.length) return;
      main.appendChild(el("div", { class: "section-title" }, g));
      var grid = el("div", { class: "grid" });
      items.forEach(function (t) {
        var card = el("div", { class: "card" });
        card.innerHTML =
          '<div class="emoji">' + t.emoji + '</div>' +
          '<h3>' + t.name + '</h3>' +
          '<p>' + t.desc + '</p>' +
          (t.status === "soon" ? '<span class="badge soon">Roadmap</span>'
            : (t.badge ? '<span class="badge">' + t.badge + '</span>' : ''));
        card.onclick = function () { App.go(t.id); };
        grid.appendChild(card);
      });
      main.appendChild(grid);
    });
  }

  App.filterTools = function () {
    if (App.current === "home") App.go("home");
  };

  /* expose */
  window.ProPDF = App;

  /* ---------------- version + update check ---------------- */
  App.VERSION = "v14.0";
  var GC_ENDPOINT = "";
  function initAnalytics(url) {
    if (GC_ENDPOINT || !url || typeof location === "undefined" || !/^https?:/.test(location.protocol)) return;
    GC_ENDPOINT = url;
    var s = document.createElement("script");
    s.async = true; s.src = "https://gc.zgo.at/count.js"; s.setAttribute("data-goatcounter", url);
    document.head.appendChild(s);
  }
  App.track = function (path, title) {
    try { if (GC_ENDPOINT && window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: path, title: title || path, event: true }); } catch (e) {}
  };
  function cmpVer(a, b) { var pa = String(a).match(/\d+/g) || [], pb = String(b).match(/\d+/g) || []; var n = Math.max(pa.length, pb.length); for (var i = 0; i < n; i++) { var x = parseInt(pa[i] || 0, 10), y = parseInt(pb[i] || 0, 10); if (x !== y) return x > y; } return false; }
  function injectVersionBadge() {
    var bn = document.querySelector(".brand-name");
    if (bn && !bn.querySelector(".ver-badge")) bn.appendChild(el("span", { class: "ver-badge" }, App.VERSION));
  }
  function showUpdateBar(ver, notes) {
    if (document.querySelector(".update-bar")) return;
    var bar = el("div", { class: "update-bar" });
    bar.appendChild(el("span", { class: "update-msg" }, "✨ ProPDF " + escapeHtml(ver) + " is available" + (notes ? " — " + escapeHtml(notes) : "")));
    var b = el("button", { class: "btn" }, "Reload to update");
    b.onclick = function () { location.href = location.pathname + "?u=" + Date.now(); };
    var x = el("span", { class: "update-x", title: "Dismiss" }, "✕");
    x.onclick = function () { bar.remove(); };
    bar.appendChild(b); bar.appendChild(x);
    document.body.appendChild(bar);
  }
  App.checkForUpdate = function () {
    if (typeof location === "undefined" || !/^https?:/.test(location.protocol)) return;  // only when hosted online
    fetch("version.json?_=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (!j) return; if (j.analytics) initAnalytics(j.analytics); if (j.version && cmpVer(j.version, App.VERSION)) showUpdateBar(j.version, j.notes || ""); })
      .catch(function () {});
  };

  /* boot once tools.js has registered everything */
  function boot() {
    try { App.go("home"); injectVersionBadge(); App.checkForUpdate(); }
    catch (e) { console.error("ProPDF boot error:", e); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
