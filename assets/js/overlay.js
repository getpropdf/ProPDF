/* ============================================================
   ProPDF — Overlay / Sign / Stamp editor (multi-element)
   Unlimited stamps, signatures, logos, letterheads and text
   boxes on any page. Each element: move, resize, rotate,
   opacity, layer order, copy/paste, duplicate, copy to pages,
   delete. Undo/redo. 100% in the browser — no uploads.
   ============================================================ */
(function (root) {
  "use strict";
  var P = root.ProPDF, L = root.ProPDFLibs;
  if (!P || !L) return;
  var el = P.el;

  var CSS =
    ".oe-wrap{display:grid;grid-template-columns:110px minmax(0,1fr) 290px;gap:12px;margin-top:12px}" +
    "@media(max-width:980px){.oe-wrap{grid-template-columns:1fr}.oe-thumbs{display:flex!important;flex-direction:row!important;max-height:none!important;overflow-x:auto}}" +
    ".oe-bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:10px 0 0}" +
    ".oe-bar .btn{padding:7px 12px;font-size:13px}" +
    ".oe-sep{width:1px;height:24px;background:var(--glass-brd);margin:0 4px}" +
    ".oe-thumbs{display:flex;flex-direction:column;gap:8px;max-height:78vh;overflow-y:auto;padding-right:4px}" +
    ".oe-thumb{position:relative;border:2px solid transparent;border-radius:6px;cursor:pointer;background:#fff;flex:0 0 auto}" +
    ".oe-thumb canvas{display:block;width:100%;border-radius:4px}" +
    ".oe-thumb.on{border-color:var(--brand)}" +
    ".oe-thumb .n{position:absolute;left:4px;bottom:3px;font-size:10px;background:rgba(0,0,0,.55);color:#fff;border-radius:3px;padding:0 4px}" +
    ".oe-thumb .c{position:absolute;right:4px;top:3px;font-size:10px;background:var(--brand);color:#fff;border-radius:9px;padding:0 6px}" +
    ".oe-center{min-width:0}" +
    ".oe-nav{display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:8px;font-size:13px}" +
    ".oe-nav input{width:56px;text-align:center}" +
    ".oe-stage{position:relative;margin:0 auto;box-shadow:var(--shadow-md);background:#fff;user-select:none;touch-action:none;overflow:hidden}" +
    ".oe-stage canvas{display:block;width:100%;height:100%}" +
    ".oe-el{position:absolute;cursor:move;touch-action:none}" +
    ".oe-el img{width:100%;height:100%;display:block;pointer-events:none;-webkit-user-drag:none}" +
    ".oe-el.sel{outline:1.5px dashed #1f6feb;outline-offset:1px}" +
    ".oe-h{position:absolute;width:12px;height:12px;background:#fff;border:2px solid #1f6feb;border-radius:50%;display:none;z-index:2}" +
    ".oe-el.sel .oe-h{display:block}" +
    ".oe-h.tl{left:-7px;top:-7px;cursor:nwse-resize}.oe-h.tr{right:-7px;top:-7px;cursor:nesw-resize}" +
    ".oe-h.bl{left:-7px;bottom:-7px;cursor:nesw-resize}.oe-h.br{right:-7px;bottom:-7px;cursor:nwse-resize}" +
    ".oe-h.rot{left:50%;top:-30px;margin-left:-8px;width:16px;height:16px;cursor:grab;background:#1f6feb;border-color:#fff}" +
    ".oe-rotline{position:absolute;left:50%;top:-18px;width:1.5px;height:18px;background:#1f6feb;display:none}" +
    ".oe-el.sel .oe-rotline{display:block}" +
    ".oe-x{position:absolute;right:-9px;top:-30px;width:20px;height:20px;border-radius:50%;background:#d73a49;color:#fff;font-size:12px;line-height:20px;text-align:center;cursor:pointer;display:none;z-index:3}" +
    ".oe-el.sel .oe-x{display:block}" +
    ".oe-side{display:flex;flex-direction:column;gap:12px;min-width:0}" +
    ".oe-card{border:1px solid var(--glass-brd);border-radius:10px;padding:10px;background:var(--glass)}" +
    ".oe-card h4{margin:0 0 8px;font-size:13px}" +
    ".oe-lib{display:flex;flex-wrap:wrap;gap:6px}" +
    ".oe-asset{width:76px;height:56px;border:1px solid var(--glass-brd);border-radius:6px;background:#fff center/contain no-repeat;cursor:pointer;position:relative}" +
    ".oe-asset:hover{border-color:var(--brand)}" +
    ".oe-asset span{position:absolute;left:0;right:0;bottom:-1px;font-size:9px;background:rgba(0,0,0,.55);color:#fff;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-radius:0 0 5px 5px}" +
    ".oe-layers{display:flex;flex-direction:column;gap:4px;max-height:240px;overflow-y:auto}" +
    ".oe-layer{display:flex;align-items:center;gap:6px;padding:5px 6px;border-radius:6px;border:1px solid transparent;cursor:pointer;font-size:12.5px}" +
    ".oe-layer:hover{background:var(--glass-2)}" +
    ".oe-layer.on{border-color:var(--brand);background:var(--glass-2)}" +
    ".oe-layer .ic{width:30px;height:22px;background:#fff center/contain no-repeat;border:1px solid var(--glass-brd);border-radius:3px;flex:0 0 auto}" +
    ".oe-layer .nm{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".oe-layer button{border:none;background:none;cursor:pointer;padding:1px 3px;font-size:13px;color:var(--text)}" +
    ".oe-layer button:hover{color:var(--brand)}" +
    ".oe-props label{display:flex;justify-content:space-between;font-size:12px;margin:6px 0 2px}" +
    ".oe-props input[type=range]{width:100%}" +
    ".oe-props .row2{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}" +
    ".oe-props .row2 .btn{padding:6px 10px;font-size:12px}" +
    ".oe-muted{font-size:12px;opacity:.75}" +
    ".oe-modal{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999}" +
    ".oe-box{background:var(--bg-1,#fff);color:var(--text);border-radius:12px;padding:18px;width:min(420px,92vw);box-shadow:var(--shadow-lg)}" +
    ".oe-box h3{margin:0 0 10px}.oe-box label{display:block;font-size:12.5px;margin:8px 0 3px}" +
    ".oe-box input,.oe-box select,.oe-box textarea{width:100%;box-sizing:border-box;padding:7px;border-radius:6px;border:1px solid var(--glass-brd);background:var(--glass-2);color:var(--text)}" +
    ".oe-box .acts{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}";

  function injectCss() {
    if (document.getElementById("oe-css")) return;
    var s = document.createElement("style");
    s.id = "oe-css"; s.textContent = CSS;
    document.head.appendChild(s);
  }

  var uid = 0;
  function nid(p) { uid++; return (p || "e") + uid + "_" + Date.now().toString(36); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ---------- PDF loading (password-aware, decrypted bytes for pdf-lib) ---------- */
  function openPdf(file) {
    return Promise.all([L.ensure("pdfjs"), P.readAB(file)]).then(function (r) {
      var ab = r[1];
      function attempt(pw) {
        var params = { data: ab.slice(0) };
        if (pw != null) params.password = pw;
        return root.pdfjsLib.getDocument(params).promise.then(function (doc) {
          if (pw == null) return { doc: doc, bytes: ab };
          // protected: get decrypted bytes for pdf-lib
          return doc.saveDocument().then(function (b) {
            var u = b instanceof Uint8Array ? b : new Uint8Array(b);
            return { doc: doc, bytes: u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) };
          }, function () { return { doc: doc, bytes: ab }; });
        }, function (e) {
          if ((e && e.name) === "PasswordException" || /password/i.test((e && e.message) || "")) {
            var entered = root.prompt('"' + file.name + '" is password-protected. Enter its password:');
            if (entered == null) throw new Error("Cancelled — no password entered.");
            return attempt(entered);
          }
          throw e;
        });
      }
      return attempt(null);
    });
  }

  function dataUrlToBytes(url) {
    var b64 = url.split(",")[1], bin = atob(b64), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }

  /* any browser-decodable image -> {url(PNG/JPG), bytes, isPng, aspect, nw, nh} */
  function loadImageFile(file) {
    return P.readAB(file).then(function (ab) {
      var u8 = new Uint8Array(ab);
      var isPng = u8[0] === 0x89 && u8[1] === 0x50;
      var isJpg = u8[0] === 0xFF && u8[1] === 0xD8;
      var blobUrl = URL.createObjectURL(new Blob([ab]));
      return new Promise(function (res, rej) {
        var im = new Image();
        im.onload = function () {
          var nw = im.naturalWidth, nh = im.naturalHeight;
          if (isPng || isJpg) {
            res({ url: blobUrl, bytes: u8, isPng: isPng, aspect: nh / nw, nw: nw, nh: nh });
          } else {  // webp/gif/bmp/svg -> PNG
            var c = document.createElement("canvas");
            c.width = nw || 600; c.height = nh || 300;
            c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
            var url = c.toDataURL("image/png");
            res({ url: url, bytes: dataUrlToBytes(url), isPng: true, aspect: c.height / c.width, nw: c.width, nh: c.height });
          }
        };
        im.onerror = function () { rej(new Error("Could not read image: " + file.name)); };
        im.src = blobUrl;
      });
    });
  }

  /* make near-white pixels transparent (scanned stamps / signatures on paper) */
  function removeWhite(url) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () {
        var c = document.createElement("canvas");
        c.width = im.naturalWidth; c.height = im.naturalHeight;
        var g = c.getContext("2d");
        g.drawImage(im, 0, 0);
        var d = g.getImageData(0, 0, c.width, c.height), p = d.data;
        for (var i = 0; i < p.length; i += 4) {
          var mn = Math.min(p[i], p[i + 1], p[i + 2]);
          if (mn > 235) p[i + 3] = 0;
          else if (mn > 200) p[i + 3] = Math.round(p[i + 3] * (235 - mn) / 35);
        }
        g.putImageData(d, 0, 0);
        var out = c.toDataURL("image/png");
        res({ url: out, bytes: dataUrlToBytes(out), isPng: true });
      };
      im.onerror = rej;
      im.src = url;
    });
  }

  /* render a text box to a high-res transparent PNG */
  function textToImage(t) {
    var scale = 4, size = (+t.size || 14) * scale;
    var font = (t.bold ? "bold " : "") + (t.italic ? "italic " : "") + size + "px " + (t.font || "Helvetica, Arial, sans-serif");
    var lines = String(t.text || "").split(/\r?\n/);
    var c = document.createElement("canvas"), g = c.getContext("2d");
    g.font = font;
    var w = 1;
    lines.forEach(function (ln) { w = Math.max(w, g.measureText(ln).width); });
    var lh = size * 1.25, pad = size * 0.15;
    c.width = Math.ceil(w + pad * 2); c.height = Math.ceil(lh * lines.length + pad * 2);
    g = c.getContext("2d"); g.font = font; g.fillStyle = t.color || "#000"; g.textBaseline = "top";
    lines.forEach(function (ln, i) {
      var x = pad;
      if (t.align === "center") x = (c.width - g.measureText(ln).width) / 2;
      else if (t.align === "right") x = c.width - pad - g.measureText(ln).width;
      g.fillText(ln, x, pad + i * lh + size * 0.1);
    });
    var url = c.toDataURL("image/png");
    return { url: url, bytes: dataUrlToBytes(url), isPng: true, aspect: c.height / c.width, widthPt: c.width / scale };
  }

  /* ---------- tiny modal ---------- */
  function modal(title, bodyHtml, okLabel) {
    return new Promise(function (resolve) {
      var ov = el("div", { class: "oe-modal" });
      ov.innerHTML = '<div class="oe-box"><h3>' + title + "</h3>" + bodyHtml +
        '<div class="acts"><button class="btn secondary" data-a="c">Cancel</button>' +
        '<button class="btn" data-a="o">' + (okLabel || "OK") + "</button></div></div>";
      document.body.appendChild(ov);
      function done(ok) {
        var vals = {};
        Array.prototype.forEach.call(ov.querySelectorAll("[name]"), function (i) {
          vals[i.name] = i.type === "checkbox" ? i.checked : i.value;
        });
        ov.remove();
        resolve(ok ? vals : null);
      }
      ov.querySelector('[data-a="c"]').onclick = function () { done(false); };
      ov.querySelector('[data-a="o"]').onclick = function () { done(true); };
      ov.addEventListener("mousedown", function (e) { if (e.target === ov) done(false); });
      ov.addEventListener("keydown", function (e) {
        if (e.key === "Escape") done(false);
        if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") { e.preventDefault(); done(true); }
      });
      var first = ov.querySelector("input,textarea,select");
      if (first) setTimeout(function () { first.focus(); }, 30);
    });
  }

  /* pages selector -> 0-based indices */
  function pickPages(kind, rangeStr, total, current) {
    var out = [], i;
    if (kind === "all") for (i = 0; i < total; i++) out.push(i);
    else if (kind === "others") for (i = 0; i < total; i++) { if (i !== current) out.push(i); }
    else if (kind === "odd") for (i = 0; i < total; i += 2) out.push(i);
    else if (kind === "even") for (i = 1; i < total; i += 2) out.push(i);
    else out = P.parseRanges(rangeStr || "", total);
    return out;
  }

  /* ======================= the editor ======================= */
  function Editor(panel) {
    injectCss();
    var S = {
      file: null, pdf: null, bytes: null, pages: [],    // pages[i] = {w,h} displayed @ scale 1
      cur: 0, assets: {}, els: [], sel: null, clip: null,
      undo: [], redo: []
    };
    var self = this;

    /* ---------- static UI ---------- */
    var intro = el("div", { class: "oe-muted", style: "margin:2px 0 8px" },
      "1) Add your PDF  2) Add any number of stamps, signatures, logos, letterheads or text  " +
      "3) Drag to move • corner dots to resize • top dot to rotate • right panel to reorder, copy to other pages, delete.");
    panel.appendChild(intro);
    var zone = P.fileZone({ accept: "application/pdf,.pdf", hint: "the PDF you want to sign / stamp", onChange: function (f) { if (f[0]) loadBase(f[0]); } });
    panel.appendChild(zone.el);

    var bar = el("div", { class: "oe-bar" });
    var imgInput = el("input", { type: "file", accept: "image/*,.pdf,application/pdf", multiple: "multiple", style: "display:none" });
    var bAdd = el("button", { class: "btn" }, "＋ Stamp / Signature / Image");
    var bText = el("button", { class: "btn secondary" }, "＋ Text");
    var bUndo = el("button", { class: "btn secondary", title: "Undo (Ctrl+Z)" }, "↶ Undo");
    var bRedo = el("button", { class: "btn secondary", title: "Redo (Ctrl+Y)" }, "↷ Redo");
    var bCopy = el("button", { class: "btn secondary", title: "Copy (Ctrl+C)" }, "Copy");
    var bPaste = el("button", { class: "btn secondary", title: "Paste on this page (Ctrl+V)" }, "Paste");
    var bSave = el("button", { class: "btn" }, "Save PDF ▸");
    [bAdd, bText, el("span", { class: "oe-sep" }), bUndo, bRedo, el("span", { class: "oe-sep" }), bCopy, bPaste].forEach(function (b) { bar.appendChild(b); });
    var spacer = el("span", { style: "flex:1" }); bar.appendChild(spacer); bar.appendChild(bSave);
    bar.appendChild(imgInput);
    bar.style.display = "none";
    panel.appendChild(bar);

    var prog = P.progressWidget(), res = P.resultWidget();
    panel.appendChild(prog.el); panel.appendChild(res.el);

    var wrap = el("div", { class: "oe-wrap" }); wrap.style.display = "none";
    var thumbs = el("div", { class: "oe-thumbs" });
    var center = el("div", { class: "oe-center" });
    var side = el("div", { class: "oe-side" });
    wrap.appendChild(thumbs); wrap.appendChild(center); wrap.appendChild(side);
    panel.appendChild(wrap);

    var nav = el("div", { class: "oe-nav" });
    nav.innerHTML = '<button class="btn secondary" data-n="p">‹ Prev</button> Page <input type="number" min="1" value="1"> of <b>1</b> <button class="btn secondary" data-n="n">Next ›</button>';
    center.appendChild(nav);
    var stage = el("div", { class: "oe-stage" });
    var canvas = el("canvas");
    stage.appendChild(canvas);
    center.appendChild(stage);
    var navIn = nav.querySelector("input"), navTot = nav.querySelector("b");
    nav.querySelector('[data-n="p"]').onclick = function () { go(S.cur - 1); };
    nav.querySelector('[data-n="n"]').onclick = function () { go(S.cur + 1); };
    navIn.onchange = function () { go((+navIn.value || 1) - 1); };

    var libCard = el("div", { class: "oe-card" });
    libCard.innerHTML = '<h4>Library <span class="oe-muted">— click to place on this page</span></h4><div class="oe-lib"></div>';
    var layerCard = el("div", { class: "oe-card" });
    layerCard.innerHTML = '<h4>Elements on this page <span class="oe-muted">(top = front)</span></h4><div class="oe-layers"></div>';
    var propCard = el("div", { class: "oe-card oe-props" });
    side.appendChild(libCard); side.appendChild(layerCard); side.appendChild(propCard);
    var libBox = libCard.querySelector(".oe-lib"), layerBox = layerCard.querySelector(".oe-layers");

    /* ---------- history ---------- */
    function snapshot() { return JSON.stringify(S.els); }
    function commit() { S.undo.push(S._last || "[]"); if (S.undo.length > 100) S.undo.shift(); S.redo = []; S._last = snapshot(); }
    function restore(json) { S.els = JSON.parse(json); if (S.sel && !find(S.sel)) S.sel = null; S._last = json; drawEls(); refreshSide(); refreshThumbBadges(); }
    function undo() { if (!S.undo.length) return; S.redo.push(snapshot()); restore(S.undo.pop()); }
    function redo() { if (!S.redo.length) return; S.undo.push(snapshot()); restore(S.redo.pop()); }
    S._last = "[]";

    function find(id) { for (var i = 0; i < S.els.length; i++) if (S.els[i].id === id) return S.els[i]; return null; }
    function pageEls(p) { return S.els.filter(function (e) { return e.page === p; }); }
    function selected() { return S.sel ? find(S.sel) : null; }

    /* ---------- base PDF ---------- */
    function loadBase(file) {
      res.clear(); prog.show("Opening PDF…");
      openPdf(file).then(function (o) {
        S.file = file; S.pdf = o.doc; S.bytes = o.bytes; S.pages = []; S.els = []; S.sel = null;
        S.undo = []; S.redo = []; S._last = "[]";
        var n = o.doc.numPages, i = 1;
        function next() {
          if (i > n) return null;
          return o.doc.getPage(i).then(function (pg) {
            var vp = pg.getViewport({ scale: 1 });
            S.pages.push({ w: vp.width, h: vp.height });
            i++; return next();
          });
        }
        return next().then(function () {
          prog.hide();
          bar.style.display = ""; wrap.style.display = "";
          navTot.textContent = n; navIn.max = n;
          buildThumbs();
          go(0);
        });
      }).catch(function (e) { prog.hide(); res.err(e.message || String(e)); });
    }

    /* ---------- thumbnails ---------- */
    function buildThumbs() {
      thumbs.innerHTML = "";
      var n = S.pages.length, MAXR = 200;
      for (var i = 0; i < n; i++) {
        (function (i) {
          var t = el("div", { class: "oe-thumb" });
          t.innerHTML = '<span class="n">' + (i + 1) + '</span><span class="c" style="display:none"></span>';
          var c = el("canvas");
          var ratio = S.pages[i].h / S.pages[i].w;
          c.width = 90; c.height = Math.round(90 * ratio);
          t.insertBefore(c, t.firstChild);
          t.onclick = function () { go(i); };
          thumbs.appendChild(t);
        })(i);
      }
      // render sequentially (first MAXR pages)
      var k = 0;
      function rnd() {
        if (k >= Math.min(n, MAXR) || !thumbs.isConnected) return;
        var idx = k++;
        S.pdf.getPage(idx + 1).then(function (pg) {
          var vp1 = pg.getViewport({ scale: 1 });
          var vp = pg.getViewport({ scale: 90 / vp1.width });
          var c = thumbs.children[idx].querySelector("canvas");
          c.width = Math.round(vp.width); c.height = Math.round(vp.height);
          return pg.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
        }).then(rnd, rnd);
      }
      rnd();
      refreshThumbBadges();
    }
    function refreshThumbBadges() {
      Array.prototype.forEach.call(thumbs.children, function (t, i) {
        t.classList.toggle("on", i === S.cur);
        var c = t.querySelector(".c"), k = pageEls(i).length;
        c.style.display = k ? "" : "none"; c.textContent = k;
      });
    }

    /* ---------- page view ---------- */
    var renderTask = null;
    function go(i) {
      if (!S.pdf) return;
      i = clamp(i, 0, S.pages.length - 1);
      S.cur = i; navIn.value = i + 1;
      if (S.sel && (!selected() || selected().page !== i)) S.sel = null;
      var pg = S.pages[i];
      var avail = Math.max(280, Math.min(900, (center.clientWidth || 700) - 4));
      var sc = avail / pg.w;
      stage.style.width = Math.round(pg.w * sc) + "px";
      stage.style.height = Math.round(pg.h * sc) + "px";
      S.pdf.getPage(i + 1).then(function (p) {
        var dpr = Math.min(2, root.devicePixelRatio || 1);
        var vp = p.getViewport({ scale: sc * dpr });
        canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
        if (renderTask) { try { renderTask.cancel(); } catch (e) {} }
        renderTask = p.render({ canvasContext: canvas.getContext("2d"), viewport: vp });
        return renderTask.promise;
      }).catch(function () {});
      drawEls(); refreshSide(); refreshThumbBadges();
      var t = thumbs.children[i]; if (t && t.scrollIntoView) t.scrollIntoView({ block: "nearest" });
    }

    /* ---------- element rendering ---------- */
    function placeDiv(d, e) {
      var pg = S.pages[e.page], a = S.assets[e.asset];
      d.style.left = (e.xc * 100) + "%";
      d.style.top = (e.yc * 100) + "%";
      d.style.width = (e.w * 100) + "%";
      d.style.height = ((e.w * pg.w * a.aspect) / pg.h * 100) + "%";
      d.style.transform = "translate(-50%,-50%) rotate(" + e.rot + "deg)";
      d.style.opacity = e.op;
    }
    function drawEls() {
      Array.prototype.slice.call(stage.querySelectorAll(".oe-el")).forEach(function (n) { n.remove(); });
      pageEls(S.cur).forEach(function (e, z) {
        var a = S.assets[e.asset]; if (!a) return;
        var d = el("div", { class: "oe-el" + (e.id === S.sel ? " sel" : "") });
        d.dataset.id = e.id;
        d.style.zIndex = 10 + z;
        var img = el("img"); img.src = a.url; img.setAttribute("draggable", "false");
        d.appendChild(img);
        ["tl", "tr", "bl", "br"].forEach(function (k) { var h = el("div", { class: "oe-h " + k }); h.dataset.h = "scale"; d.appendChild(h); });
        d.appendChild(el("div", { class: "oe-rotline" }));
        var r = el("div", { class: "oe-h rot", title: "Rotate (Shift = 15° steps)" }); r.dataset.h = "rot"; d.appendChild(r);
        var x = el("div", { class: "oe-x", title: "Delete" }, "✕"); x.dataset.h = "del"; d.appendChild(x);
        if (a.kind === "text") d.title = "Double-click to edit text";
        placeDiv(d, e);
        stage.appendChild(d);
      });
    }
    function divOf(id) { return stage.querySelector('.oe-el[data-id="' + id + '"]'); }
    function select(id) {
      S.sel = id;
      Array.prototype.forEach.call(stage.querySelectorAll(".oe-el"), function (n) { n.classList.toggle("sel", n.dataset.id === id); });
      refreshSide();
    }

    /* ---------- pointer interactions (mouse + touch) ---------- */
    var drag = null;
    stage.addEventListener("pointerdown", function (ev) {
      var t = ev.target, d = t.closest ? t.closest(".oe-el") : null;
      if (!d) { select(null); return; }
      var e = find(d.dataset.id); if (!e) return;
      ev.preventDefault();
      var h = t.dataset ? t.dataset.h : null;
      if (h === "del") { removeEl(e.id); return; }
      select(e.id);
      var b = stage.getBoundingClientRect();
      var cx = b.left + e.xc * b.width, cy = b.top + e.yc * b.height;
      drag = { e: e, d: d, mode: h === "scale" ? "scale" : (h === "rot" ? "rot" : "move"),
               sx: ev.clientX, sy: ev.clientY, x0: e.xc, y0: e.yc, w0: e.w, r0: e.rot, cx: cx, cy: cy,
               dist0: Math.max(4, Math.hypot(ev.clientX - cx, ev.clientY - cy)), moved: false, b: b };
      try { stage.setPointerCapture(ev.pointerId); } catch (x) {}
    });
    stage.addEventListener("pointermove", function (ev) {
      if (!drag) return;
      var e = drag.e, b = drag.b;
      if (drag.mode === "move") {
        e.xc = clamp(drag.x0 + (ev.clientX - drag.sx) / b.width, -0.2, 1.2);
        e.yc = clamp(drag.y0 + (ev.clientY - drag.sy) / b.height, -0.2, 1.2);
      } else if (drag.mode === "scale") {
        var dist = Math.hypot(ev.clientX - drag.cx, ev.clientY - drag.cy);
        e.w = clamp(drag.w0 * dist / drag.dist0, 0.01, 3);
      } else {
        var ang = Math.atan2(ev.clientY - drag.cy, ev.clientX - drag.cx) * 180 / Math.PI + 90;
        if (ev.shiftKey) ang = Math.round(ang / 15) * 15;
        e.rot = Math.round(((ang % 360) + 540) % 360 - 180);
      }
      drag.moved = true;
      placeDiv(drag.d, e);
    });
    function endDrag() {
      if (!drag) return;
      var moved = drag.moved; drag = null;
      if (moved) { commit(); refreshSide(); }
    }
    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", endDrag);
    stage.addEventListener("dblclick", function (ev) {
      var d = ev.target.closest ? ev.target.closest(".oe-el") : null;
      if (!d) return;
      var e = find(d.dataset.id);
      if (e && S.assets[e.asset].kind === "text") editText(e);
    });

    /* ---------- assets ---------- */
    function addAsset(a) { a.id = nid("a"); S.assets[a.id] = a; refreshLib(); return a; }
    function assetFromFile(file) {
      var isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name);
      var name = file.name.replace(/\.[^.]+$/, "");
      if (!isPdf) {
        return loadImageFile(file).then(function (im) {
          return addAsset({ kind: "image", name: name, url: im.url, bytes: im.bytes, isPng: im.isPng, aspect: im.aspect, natPt: null });
        });
      }
      // PDF (letterhead / vector stamp): preview = page 1 rendered transparent; export = vector
      return P.readAB(file).then(function (ab) {
        return L.ensure("pdfjs").then(function () { return root.pdfjsLib.getDocument({ data: ab.slice(0) }).promise; })
          .then(function (d) { return d.getPage(1); })
          .then(function (pg) {
            var vp1 = pg.getViewport({ scale: 1 });
            var vp = pg.getViewport({ scale: Math.min(3, 1600 / vp1.width) });
            var c = el("canvas"); c.width = vp.width; c.height = vp.height;
            return pg.render({ canvasContext: c.getContext("2d"), viewport: vp, background: "rgba(0,0,0,0)" }).promise.then(function () {
              return addAsset({ kind: "pdf", name: name, url: c.toDataURL("image/png"), bytes: new Uint8Array(ab), aspect: vp1.height / vp1.width, natPt: vp1.width });
            });
          });
      });
    }

    function place(asset, opts) {
      opts = opts || {};
      var pg = S.pages[S.cur];
      var w;
      if (asset.kind === "pdf") w = clamp(asset.natPt / pg.w, 0.2, 1);
      else if (asset.kind === "text") w = clamp(asset.natPt / pg.w, 0.02, 1);
      else w = 0.25;
      // keep tall images from overflowing
      var hFrac = w * pg.w * asset.aspect / pg.h;
      if (hFrac > 0.6) w = w * 0.6 / hFrac;
      var n = pageEls(S.cur).length;
      var e = { id: nid("e"), asset: asset.id, page: S.cur,
                xc: opts.xc != null ? opts.xc : clamp(0.5 + (n % 5) * 0.03, 0, 1),
                yc: opts.yc != null ? opts.yc : clamp(0.5 + (n % 5) * 0.03, 0, 1),
                w: w, rot: 0, op: 1, name: asset.name };
      if (asset.kind === "pdf" && Math.abs(w - 1) < 0.02) { e.xc = 0.5; e.yc = 0.5 * (pg.w * asset.aspect) / pg.h; }
      S.els.push(e);
      commit(); drawEls(); select(e.id); refreshThumbBadges();
      return e;
    }

    bAdd.onclick = function () { imgInput.click(); };
    imgInput.onchange = function () {
      var files = Array.prototype.slice.call(imgInput.files || []);
      imgInput.value = "";
      var chain = Promise.resolve();
      files.forEach(function (f) {
        chain = chain.then(function () { return assetFromFile(f).then(function (a) { place(a); }); });
      });
      chain.catch(function (e) { res.err(e.message || String(e)); });
    };

    var lastText = { text: "", size: 14, color: "#1a1a1a", bold: false, italic: false, align: "left" };
    function textForm(t) {
      return '<label>Text</label><textarea name="text" rows="3">' + P.escapeHtml(t.text || "") + "</textarea>" +
        '<div style="display:flex;gap:8px"><div style="flex:1"><label>Size (pt)</label><input name="size" type="number" min="4" max="200" value="' + t.size + '"></div>' +
        '<div style="flex:1"><label>Colour</label><input name="color" type="color" value="' + t.color + '"></div>' +
        '<div style="flex:1"><label>Align</label><select name="align"><option value="left">Left</option><option value="center"' + (t.align === "center" ? " selected" : "") + '>Centre</option><option value="right"' + (t.align === "right" ? " selected" : "") + '>Right</option></select></div></div>' +
        '<label style="display:inline-flex;gap:6px;align-items:center"><input name="bold" type="checkbox" style="width:auto"' + (t.bold ? " checked" : "") + "> Bold</label> " +
        '<label style="display:inline-flex;gap:6px;align-items:center"><input name="italic" type="checkbox" style="width:auto"' + (t.italic ? " checked" : "") + "> Italic</label>";
    }
    function makeTextAsset(v) {
      var t = { text: v.text, size: +v.size || 14, color: v.color || "#000", bold: !!v.bold, italic: !!v.italic, align: v.align || "left" };
      var im = textToImage(t);
      var nm = (t.text.split(/\r?\n/)[0] || "Text").slice(0, 24);
      return addAsset({ kind: "text", name: nm, url: im.url, bytes: im.bytes, isPng: true, aspect: im.aspect, natPt: im.widthPt, text: t });
    }
    bText.onclick = function () {
      modal("Add text", textForm(lastText), "Add").then(function (v) {
        if (!v || !String(v.text).trim()) return;
        lastText = { text: "", size: +v.size, color: v.color, bold: v.bold, italic: v.italic, align: v.align };
        place(makeTextAsset(v));
      });
    };
    function editText(e) {
      var old = S.assets[e.asset];
      modal("Edit text", textForm(old.text), "Update").then(function (v) {
        if (!v || !String(v.text).trim()) return;
        var a = makeTextAsset(v);
        e.w = e.w * (a.natPt / old.natPt);
        e.asset = a.id; e.name = a.name;
        commit(); drawEls(); refreshSide();
      });
    }

    /* ---------- element operations ---------- */
    function cloneTo(e, page, dx, dy) {
      var srcW = S.pages[e.page].w, dstW = S.pages[page].w;
      var c = JSON.parse(JSON.stringify(e));
      c.id = nid("e"); c.page = page;
      c.w = e.w * srcW / dstW;   // keep the same physical size
      c.xc = clamp(e.xc + (dx || 0), -0.2, 1.2); c.yc = clamp(e.yc + (dy || 0), -0.2, 1.2);
      return c;
    }
    function removeEl(id) {
      S.els = S.els.filter(function (x) { return x.id !== id; });
      if (S.sel === id) S.sel = null;
      commit(); drawEls(); refreshSide(); refreshThumbBadges();
    }
    function duplicate(e) {
      var c = cloneTo(e, e.page, 0.03, 0.03);
      S.els.push(c); commit(); if (e.page === S.cur) { drawEls(); select(c.id); } refreshThumbBadges();
    }
    function copySel() {
      var e = selected(); if (!e) { P.toast("Select an element first", true); return; }
      S.clip = JSON.parse(JSON.stringify(e));
      P.toast("Copied — go to any page and press Paste (Ctrl+V)");
    }
    function paste() {
      if (!S.clip) { P.toast("Nothing copied yet", true); return; }
      if (!S.assets[S.clip.asset]) return;
      var same = pageEls(S.cur).some(function (x) { return Math.abs(x.xc - S.clip.xc) < 0.005 && Math.abs(x.yc - S.clip.yc) < 0.005 && x.asset === S.clip.asset; });
      var c = cloneTo(S.clip, S.cur, same ? 0.03 : 0, same ? 0.03 : 0);
      if (S.clip.page != null && S.pages[S.clip.page]) c.w = S.clip.w * S.pages[S.clip.page].w / S.pages[S.cur].w;
      S.els.push(c); commit(); drawEls(); select(c.id); refreshThumbBadges();
    }
    function zMove(e, dir) {   // dir: +1 forward, -1 backward, +9 front, -9 back
      var idx = S.els.indexOf(e);
      var same = S.els.map(function (x, i) { return x.page === e.page ? i : -1; }).filter(function (i) { return i >= 0; });
      var pos = same.indexOf(idx);
      var target;
      if (dir === 9) target = same[same.length - 1];
      else if (dir === -9) target = same[0];
      else target = same[pos + dir];
      if (target == null || target === idx) return;
      S.els.splice(idx, 1);
      var tIdx = S.els.indexOf(S.els.filter(function (x) { return x.page === e.page; })[0]);
      // recompute target position after removal
      var list = S.els.map(function (x, i) { return x.page === e.page ? i : -1; }).filter(function (i) { return i >= 0; });
      var newPos = clamp(dir === 9 ? list.length : dir === -9 ? 0 : pos + dir, 0, list.length);
      var insertAt = newPos >= list.length ? (list.length ? list[list.length - 1] + 1 : S.els.length) : list[newPos];
      S.els.splice(insertAt, 0, e);
      commit(); drawEls(); select(e.id);
    }
    function copyToPages(list, title) {
      if (!list.length) return;
      modal(title,
        '<label>Copy to</label><select name="kind"><option value="others">All other pages</option><option value="all">All pages</option>' +
        '<option value="odd">Odd pages</option><option value="even">Even pages</option><option value="range">Specific pages…</option></select>' +
        '<label>Pages (for "Specific pages", e.g. 2-5, 8, 10)</label><input name="range" placeholder="2-5, 8">' +
        '<p class="oe-muted" style="margin-top:10px">Copies keep the same position, size, rotation and opacity. Each copy can then be moved or deleted on its own.</p>',
        "Copy").then(function (v) {
          if (!v) return;
          var pages = pickPages(v.kind, v.range, S.pages.length, S.cur);
          var n = 0;
          pages.forEach(function (p) {
            list.forEach(function (e) { if (p === e.page) return; S.els.push(cloneTo(e, p)); n++; });
          });
          commit(); drawEls(); refreshSide(); refreshThumbBadges();
          P.toast(n ? "Placed " + n + " cop" + (n === 1 ? "y" : "ies") + " on " + pages.length + " page(s)" : "No pages matched", !n);
        });
    }

    /* ---------- side panel ---------- */
    function refreshLib() {
      libBox.innerHTML = "";
      var ids = Object.keys(S.assets);
      if (!ids.length) { libBox.innerHTML = '<span class="oe-muted">Added stamps, signatures and text appear here for re-use.</span>'; return; }
      ids.forEach(function (id) {
        var a = S.assets[id];
        var t = el("div", { class: "oe-asset", title: "Place \"" + a.name + "\" on this page" });
        t.style.backgroundImage = "url('" + a.url + "')";
        t.appendChild(el("span", null, P.escapeHtml(a.name)));
        t.onclick = function () { place(a); };
        libBox.appendChild(t);
      });
    }
    function refreshSide() {
      // layers (front first)
      layerBox.innerHTML = "";
      var list = pageEls(S.cur).slice().reverse();
      if (!list.length) layerBox.innerHTML = '<span class="oe-muted">Nothing on this page yet.</span>';
      list.forEach(function (e) {
        var a = S.assets[e.asset];
        var r = el("div", { class: "oe-layer" + (e.id === S.sel ? " on" : "") });
        var ic = el("span", { class: "ic" }); ic.style.backgroundImage = "url('" + a.url + "')";
        r.appendChild(ic);
        var nm = el("span", { class: "nm", title: "Double-click to rename" }, P.escapeHtml(e.name || a.name));
        nm.ondblclick = function (ev) {
          ev.stopPropagation();
          modal("Rename", '<label>Name</label><input name="n" value="' + P.escapeHtml(e.name || a.name) + '">').then(function (v) {
            if (v && v.n.trim()) { e.name = v.n.trim(); commit(); refreshSide(); }
          });
        };
        r.appendChild(nm);
        [["▲", "Bring forward", function () { zMove(e, 1); }],
         ["▼", "Send backward", function () { zMove(e, -1); }],
         ["⧉", "Duplicate", function () { duplicate(e); }],
         ["🗑", "Delete", function () { removeEl(e.id); }]].forEach(function (b) {
          var x = el("button", { title: b[1] }, b[0]);
          x.onclick = function (ev) { ev.stopPropagation(); b[2](); };
          r.appendChild(x);
        });
        r.onclick = function () { select(e.id); };
        layerBox.appendChild(r);
      });

      // properties
      var e = selected();
      if (!e) {
        propCard.innerHTML = "<h4>Properties</h4><p class=\"oe-muted\">Select an element on the page (or in the list above) to adjust it.</p>";
        if (pageEls(S.cur).length) {
          var b = el("button", { class: "btn secondary", style: "margin-top:6px;font-size:12px;padding:6px 10px" }, "Copy everything on this page to other pages…");
          b.onclick = function () { copyToPages(pageEls(S.cur), "Copy all elements of this page"); };
          propCard.appendChild(b);
        }
        return;
      }
      var a = S.assets[e.asset];
      var pg = S.pages[e.page];
      var mmW = (e.w * pg.w / 72 * 25.4).toFixed(0);
      propCard.innerHTML = "<h4>Properties — " + P.escapeHtml(e.name || a.name) + "</h4>" +
        '<label>Opacity <b data-v="op">' + Math.round(e.op * 100) + '%</b></label><input type="range" min="5" max="100" data-k="op" value="' + Math.round(e.op * 100) + '">' +
        '<label>Rotation <b data-v="rot">' + e.rot + '°</b></label><input type="range" min="-180" max="180" data-k="rot" value="' + e.rot + '">' +
        '<label>Width <b data-v="w">' + mmW + ' mm</b></label><input type="range" min="1" max="150" data-k="w" value="' + Math.round(e.w * 100) + '">' +
        '<div class="row2"></div>';
      Array.prototype.forEach.call(propCard.querySelectorAll("input[type=range]"), function (inp) {
        inp.oninput = function () {
          var k = inp.dataset.k, v = +inp.value;
          if (k === "op") e.op = v / 100;
          else if (k === "rot") e.rot = v;
          else e.w = v / 100;
          var d = divOf(e.id); if (d) placeDiv(d, e);
          var lab = propCard.querySelector('[data-v="' + k + '"]');
          lab.textContent = k === "op" ? v + "%" : k === "rot" ? v + "°" : (e.w * pg.w / 72 * 25.4).toFixed(0) + " mm";
        };
        inp.onchange = function () { commit(); };
      });
      var row2 = propCard.querySelector(".row2");
      var acts = [
        ["Copy to pages…", function () { copyToPages([e], "Copy \"" + (e.name || a.name) + "\" to other pages"); }],
        ["Duplicate", function () { duplicate(e); }],
        ["Bring to front", function () { zMove(e, 9); }],
        ["Send to back", function () { zMove(e, -9); }],
        ["Reset rotation", function () { e.rot = 0; commit(); drawEls(); refreshSide(); }]
      ];
      if (a.kind === "image") acts.push(["Remove white background", function () {
        removeWhite(a.url).then(function (r) {
          var na = addAsset({ kind: "image", name: a.name + " (clear)", url: r.url, bytes: r.bytes, isPng: true, aspect: a.aspect });
          S.els.forEach(function (x) { if (x.asset === a.id) x.asset = na.id; });
          commit(); drawEls(); refreshSide();
          P.toast("White background removed — the paper now shows through.");
        });
      }]);
      if (a.kind === "text") acts.push(["Edit text", function () { editText(e); }]);
      acts.push(["Delete", function () { removeEl(e.id); }]);
      acts.forEach(function (x) {
        var b = el("button", { class: "btn secondary" }, x[0]);
        if (x[0] === "Delete") b.style.color = "var(--danger)";
        b.onclick = x[1];
        row2.appendChild(b);
      });
    }

    /* cleaner z-order: reorder only this page's elements */
    zMove = function (e, dir) {
      var mine = S.els.filter(function (x) { return x.page === e.page; });
      var others = S.els.filter(function (x) { return x.page !== e.page; });
      var i = mine.indexOf(e);
      mine.splice(i, 1);
      var j = dir === 9 ? mine.length : dir === -9 ? 0 : clamp(i + dir, 0, mine.length);
      mine.splice(j, 0, e);
      S.els = others.concat(mine);
      commit(); drawEls(); select(e.id);
    };

    bUndo.onclick = undo; bRedo.onclick = redo;
    bCopy.onclick = copySel; bPaste.onclick = paste;

    /* ---------- keyboard ---------- */
    function onKey(ev) {
      if (!panel.isConnected) { document.removeEventListener("keydown", onKey); return; }
      if (!S.pdf || document.querySelector(".oe-modal")) return;
      var tg = ev.target && ev.target.tagName;
      if (tg === "INPUT" || tg === "TEXTAREA" || tg === "SELECT") return;
      var k = ev.key, mod = ev.ctrlKey || ev.metaKey, e = selected();
      if (mod && (k === "z" || k === "Z") && !ev.shiftKey) { ev.preventDefault(); undo(); return; }
      if (mod && (k === "y" || ((k === "z" || k === "Z") && ev.shiftKey))) { ev.preventDefault(); redo(); return; }
      if (mod && (k === "c" || k === "C")) { if (e) { ev.preventDefault(); copySel(); } return; }
      if (mod && (k === "v" || k === "V")) { if (S.clip) { ev.preventDefault(); paste(); } return; }
      if (mod && (k === "d" || k === "D")) { if (e) { ev.preventDefault(); duplicate(e); } return; }
      if (k === "PageDown") { ev.preventDefault(); go(S.cur + 1); return; }
      if (k === "PageUp") { ev.preventDefault(); go(S.cur - 1); return; }
      if (!e) return;
      if (k === "Delete" || k === "Backspace") { ev.preventDefault(); removeEl(e.id); return; }
      if (k === "Escape") { select(null); return; }
      var step = ev.shiftKey ? 0.02 : 0.002, mv = null;
      if (k === "ArrowLeft") mv = [-step, 0]; else if (k === "ArrowRight") mv = [step, 0];
      else if (k === "ArrowUp") mv = [0, -step]; else if (k === "ArrowDown") mv = [0, step];
      if (mv) {
        ev.preventDefault();
        e.xc = clamp(e.xc + mv[0], -0.2, 1.2); e.yc = clamp(e.yc + mv[1], -0.2, 1.2);
        var d = divOf(e.id); if (d) placeDiv(d, e);
        clearTimeout(S._nudge); S._nudge = setTimeout(commit, 400);
      }
    }
    document.addEventListener("keydown", onKey);

    var resizeT = null;
    root.addEventListener("resize", function () {
      if (!panel.isConnected || !S.pdf) return;
      clearTimeout(resizeT); resizeT = setTimeout(function () { go(S.cur); }, 200);
    });

    /* ---------- export ---------- */
    bSave.onclick = function () {
      if (!S.pdf) return;
      if (!S.els.length) { P.toast("Add at least one stamp, signature or text first", true); return; }
      res.clear(); prog.show("Building PDF…"); bSave.disabled = true;
      exportPdf(S).then(function (bytes) {
        var base = (S.file && S.file.name || "document.pdf").replace(/\.pdf$/i, "");
        P.download(base + "_signed.pdf", bytes, "application/pdf");
        var pages = {}; S.els.forEach(function (e) { pages[e.page] = 1; });
        prog.hide(); bSave.disabled = false;
        res.ok("Saved — " + S.els.length + " element(s) placed on " + Object.keys(pages).length + " page(s). Your edits are still open if you want to change anything and save again.");
      }).catch(function (e) {
        prog.hide(); bSave.disabled = false; res.err("Could not save: " + (e.message || e));
      });
    };

    refreshLib(); refreshSide();
  }

  /* geometry: displayed (u,v in 0..1, top-left origin, after page /Rotate R)
     -> unrotated PDF user space inside the crop box */
  function mapPoint(u, v, R, box) {
    var W = box.width, H = box.height, x, y;
    if (R === 90) { x = v * W; y = u * H; }
    else if (R === 180) { x = W - u * W; y = v * H; }
    else if (R === 270) { x = W - v * W; y = H - u * H; }
    else { x = u * W; y = H - v * H; }
    return { x: box.x + x, y: box.y + y };
  }

  function exportPdf(S) {
    return L.ensure("pdfLib").then(function () {
      var PDFLib = root.PDFLib;
      return PDFLib.PDFDocument.load(S.bytes.slice(0), { ignoreEncryption: true }).then(function (doc) {
        var cache = {};
        function embed(a) {
          if (cache[a.id]) return Promise.resolve(cache[a.id]);
          var p;
          if (a.kind === "pdf") {
            p = PDFLib.PDFDocument.load(a.bytes.slice(0), { ignoreEncryption: true }).then(function (od) {
              return doc.embedPage(od.getPage(0));
            }).then(function (emb) { return { emb: emb, page: true }; });
          } else {
            p = (a.isPng ? doc.embedPng(a.bytes) : doc.embedJpg(a.bytes)).then(function (emb) { return { emb: emb, page: false }; });
          }
          return p.then(function (r) { cache[a.id] = r; return r; });
        }
        // draw in z-order per page
        var chain = Promise.resolve();
        S.els.forEach(function (e) {
          chain = chain.then(function () {
            var a = S.assets[e.asset];
            return embed(a).then(function (em) {
              var page = doc.getPage(e.page);
              var R = ((page.getRotation().angle % 360) + 360) % 360;
              var box = page.getCropBox ? page.getCropBox() : { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() };
              var Dw = (R % 180 === 0) ? box.width : box.height;
              var w = e.w * Dw, h = w * a.aspect;
              var c = mapPoint(e.xc, e.yc, R, box);
              var phi = R - e.rot, th = phi * Math.PI / 180, cos = Math.cos(th), sin = Math.sin(th);
              var x = c.x - (cos * w / 2 - sin * h / 2);
              var y = c.y - (sin * w / 2 + cos * h / 2);
              var o = { x: x, y: y, width: w, height: h, rotate: PDFLib.degrees(phi), opacity: e.op };
              if (em.page) page.drawPage(em.emb, o); else page.drawImage(em.emb, o);
            });
          });
        });
        return chain.then(function () { return doc.save(); });
      });
    });
  }

  /* ---------- replace the old single-overlay tool ---------- */
  var tool = P.getTool ? P.getTool("overlay") : null;
  if (tool) {
    tool.name = "Sign / Stamp / Overlay";
    tool.desc = "Add stamps, signatures, logos, letterheads & text — any number, any page.";
    tool.long = "Place as many stamps, signatures, logos, letterheads (PDF/PNG/JPG) and text boxes as you like, on any pages. " +
      "Drag to move, corner dots to resize, top dot to rotate; reorder layers, copy & paste between pages, duplicate, " +
      "copy to all / selected pages, remove white backgrounds from scanned stamps, undo/redo. Everything stays on your computer.";
    tool.render = function (panel) { new Editor(panel); };
  }
  root.ProPDFOverlay = { mapPoint: mapPoint, exportPdf: exportPdf, textToImage: textToImage };
})(window);
