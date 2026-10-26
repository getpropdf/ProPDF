/* ============================================================
   ProPDF — XTract: high-accuracy PDF → Excel in the browser.
   Same pipeline as the ProPDF Engine, fully client-side:
   words → document-GLOBAL column geometry → header mapping with
   content-based repair → bank-statement reconstruction →
   balance-continuity validation → formatted .xlsx.
   Runs anywhere (GitHub Pages, file://). No uploads, ever.
   ============================================================ */
(function (root) {
  "use strict";

  /* ================= pure logic (shared with node tests) ================= */

  var NIL = { "": 1, "-": 1, "--": 1, "—": 1, "–": 1, "nil": 1, "na": 1, "n.a.": 1, "n/a": 1, ".": 1 };
  var MONEY_RE = /^\(?\s*-?\s*(?:\d{1,3}(?:[,\s]\d{2,3})*|\d+)(?:\.\d{1,4})?\s*\)?\s*(?:cr|dr)?\.?$/i;
  var DATE_RES = [
    /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/,          // dd-mm-yyyy
    /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})$/,          // dd-mm-yy
    /^(\d{1,2})[\-\s]([A-Za-z]{3,9})[\-\s](\d{2,4})$/,    // dd-Mon-yyyy
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/                       // yyyy-mm-dd
  ];
  var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

  function parseNumber(raw) {
    if (raw == null) return null;
    var s = String(raw).trim();
    if (NIL[s.toLowerCase()]) return null;
    s = s.replace(/[₹$€£]|Rs\.?\s*|INR\s*/gi, "").trim();
    if (!s || !MONEY_RE.test(s)) return null;
    var neg = false, low = s.toLowerCase();
    if (/dr\.?$/.test(low)) { neg = true; s = s.replace(/\s*dr\.?$/i, ""); }
    else if (/cr\.?$/.test(low)) { s = s.replace(/\s*cr\.?$/i, ""); }
    s = s.trim();
    if (s.charAt(0) === "(" && s.charAt(s.length - 1) === ")") { neg = true; s = s.slice(1, -1); }
    s = s.replace(/[,\s]/g, "");
    if (s.charAt(0) === "-") { neg = !neg ? true : neg; s = s.replace(/^-+/, ""); }
    if (!s) return null;
    var v = parseFloat(s);
    if (isNaN(v)) return null;
    v = Math.round(v * 10000) / 10000;
    return neg ? -v : v;
  }
  function isNumber(s) { return parseNumber(s) !== null; }

  function parseDate(raw) {
    if (raw == null) return null;
    var s = String(raw).trim();
    if (!s || s.length > 20) return null;
    for (var i = 0; i < DATE_RES.length; i++) {
      var m = DATE_RES[i].exec(s);
      if (!m) continue;
      var d, mo, y;
      if (i === 3) { y = +m[1]; mo = +m[2]; d = +m[3]; }
      else if (i === 2) {
        d = +m[1]; y = +m[3]; mo = MONTHS[m[2].slice(0, 3).toLowerCase()] || 0;
      } else {
        d = +m[1]; mo = +m[2]; y = +m[3];
        if (y < 100) y += 2000;
      }
      if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y > 1900 && y < 2100) {
        return { d: d, m: mo, y: y, str: pad2(d) + "-" + pad2(mo) + "-" + y };
      }
    }
    return null;
  }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function isDate(s) { return parseDate(s) !== null; }

  /* ---- word grid geometry ---- */

  function clusterRows(words) {
    if (!words.length) return [];
    var ws = words.slice().sort(function (a, b) { return a.top - b.top || a.x0 - b.x0; });
    var rows = [], cur = [], curBottom = null;
    for (var i = 0; i < ws.length; i++) {
      var w = ws[i], h = Math.max(2, w.bottom - w.top);
      if (cur.length && w.top > curBottom - Math.min(3, h * 0.25)) {
        rows.push(cur); cur = [w]; curBottom = w.bottom;
      } else {
        cur.push(w);
        curBottom = curBottom == null ? w.bottom : Math.max(curBottom, w.bottom);
      }
    }
    if (cur.length) rows.push(cur);
    return rows;
  }

  function findBounds(rowsBasis, minGap, threshFrac) {
    threshFrac = threshFrac || 0.08;
    var RES = 2, all = [];
    rowsBasis.forEach(function (r) { r.forEach(function (w) { all.push(w); }); });
    if (!all.length) return [];
    var minX = Infinity, maxX = -Infinity;
    all.forEach(function (w) { if (w.x0 < minX) minX = w.x0; if (w.x1 > maxX) maxX = w.x1; });
    var nb = Math.floor(maxX / RES) + 2;
    var covered = new Array(nb + 1).fill(0);
    function gapsOf(r) {
      var ws = r.slice().sort(function (a, b) { return a.x0 - b.x0; });
      var g = 0;
      for (var q = 1; q < ws.length; q++) {
        if (ws[q].x0 - ws[q - 1].x1 >= Math.max(minGap, 6)) g++;
      }
      return g;
    }
    var tabular = rowsBasis.filter(function (r) { return gapsOf(r) >= 2; });
    var basis;
    if (tabular.length >= 3) basis = tabular;
    else {
      var multi = rowsBasis.filter(function (r) { return r.length > 1; });
      basis = multi.length >= 2 ? multi : rowsBasis;
    }
    basis.forEach(function (r) {
      r.forEach(function (w) {
        var b0 = Math.max(0, Math.floor(w.x0 / RES)), b1 = Math.min(nb, Math.floor(w.x1 / RES));
        for (var b = b0; b <= b1; b++) covered[b]++;
      });
    });
    var thresh = Math.max(1, Math.floor(basis.length * threshFrac));
    var seps = [], inGap = false, gapStart = 0;
    for (var b = Math.floor(minX / RES); b <= Math.floor(maxX / RES); b++) {
      if (covered[b] <= thresh) {
        if (!inGap) { inGap = true; gapStart = b; }
      } else {
        if (inGap && (b - gapStart) * RES >= minGap) seps.push(((gapStart + b) / 2) * RES);
        inGap = false;
      }
    }
    return seps;
  }

  function applyBounds(rows, seps, minGap) {
    if (!seps.length) {
      return rows.map(function (r) {
        return [r.slice().sort(function (a, b) { return a.x0 - b.x0; })
          .map(function (w) { return w.text; }).join(" ")];
      });
    }
    var bounds = [-1e9].concat(seps, [1e9]);
    function bandOf(x) {
      for (var j = 0; j < bounds.length - 1; j++) {
        if (x >= bounds[j] && x < bounds[j + 1]) return j;
      }
      return bounds.length - 2;
    }
    return rows.map(function (r) {
      var ws = r.slice().sort(function (a, b) { return a.x0 - b.x0; });
      if (minGap != null && ws.length > 1) {
        var biggest = 0;
        for (var q = 1; q < ws.length; q++) {
          var g = ws[q].x0 - ws[q - 1].x1;
          if (g > biggest) biggest = g;
        }
        if (biggest < Math.max(minGap, 6)) {
          var cells0 = new Array(bounds.length - 1).fill("");
          cells0[bandOf((ws[0].x0 + ws[0].x1) / 2)] = ws.map(function (w) { return w.text; }).join(" ");
          return cells0;
        }
      }
      var cells = new Array(bounds.length - 1).fill("");
      ws.forEach(function (w) {
        var j = bandOf((w.x0 + w.x1) / 2);
        cells[j] = (cells[j] + " " + w.text).trim();
      });
      return cells;
    });
  }

  function cleanGrid(grid, keepEmptyCols) {
    var out = grid.filter(function (r) { return r.some(function (c) { return String(c).trim(); }); })
      .map(function (r) { return r.map(function (c) { return String(c == null ? "" : c).trim(); }); });
    if (!out.length) return out;
    var ncol = Math.max.apply(null, out.map(function (r) { return r.length; }));
    out.forEach(function (r) { while (r.length < ncol) r.push(""); });
    if (!keepEmptyCols) {
      var keep = [];
      for (var j = 0; j < ncol; j++) {
        if (out.some(function (r) { return r[j]; })) keep.push(j);
      }
      out = out.map(function (r) { return keep.map(function (j) { return r[j]; }); });
    }
    return out;
  }

  function globalGrids(wordsPages, minGap, threshFrac) {
    var rowsPages = wordsPages.map(clusterRows);
    var basis = [];
    rowsPages.forEach(function (rows) { rows.forEach(function (r) { basis.push(r); }); });
    var seps = findBounds(basis, minGap, threshFrac);
    return rowsPages.map(function (rows) { return cleanGrid(applyBounds(rows, seps, minGap), true); });
  }

  var NUMTOK_RE = /(?<![\d,.])\d{1,3}(?:,\d{2,3})*\.\d{2,4}(?![\d])|(?<![\d,.])\d+\.\d{2,4}(?![\d])/g;
  function numTokens(cell) {
    var m = String(cell || "").match(NUMTOK_RE);
    return m ? m.length : 0;
  }

  function scoreGrid(grid) {
    grid = cleanGrid(grid, false);
    if (grid.length < 2) return 0;
    var ncols = Math.max.apply(null, grid.map(function (r) { return r.length; }));
    if (ncols < 2) return 1;
    var filled = [];
    var cells = 0;
    grid.forEach(function (r) { r.forEach(function (c) { cells++; if (c) filled.push(c); }); });
    var fillRatio = filled.length / Math.max(1, cells);
    var coherent = 0;
    for (var j = 0; j < ncols; j++) {
      var col = grid.map(function (r) { return r[j]; }).filter(Boolean);
      if (col.length < 2) continue;
      var num = col.filter(isNumber).length, dat = col.filter(isDate).length;
      if (num / col.length >= 0.6 || dat / col.length >= 0.6) coherent++;
    }
    var undersplit = filled.filter(function (c) { return numTokens(c) >= 2; }).length / Math.max(1, filled.length);
    var dataRows = grid.filter(function (r) { return r.some(isNumber); }).length;
    return Math.round((10 * coherent + 1.5 * ncols + Math.min(15, dataRows / 5) +
                       8 * fillRatio - 35 * undersplit) * 100) / 100;
  }

  /* ---- y-aware lines with document-global geometry ---- */

  function globalStreamLines(wordsPages, minGap, threshFrac) {
    var rowsPages = wordsPages.map(clusterRows);
    var basis = [];
    rowsPages.forEach(function (rows) { rows.forEach(function (r) { basis.push(r); }); });
    var seps = findBounds(basis, minGap, threshFrac);
    var out = [], offset = 0;
    rowsPages.forEach(function (rows) {
      var page = [];
      rows.forEach(function (r) {
        var y = Infinity;
        r.forEach(function (w) { if (w.top < y) y = w.top; });
        var cells = applyBounds([r], seps, minGap)[0].map(function (c) { return String(c).trim(); });
        if (cells.some(Boolean)) page.push({ y: y + offset, cells: cells });
      });
      offset += 1000;
      out.push(page);
    });
    return out;
  }



  function splitLeadingDateColumns(grid) {
    if (!grid.length) return grid;
    var dateRx = /^(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}[\-\s][A-Za-z]{3,9}[\-\s]\d{2,4})\s+(\S[\s\S]*)$/;
    var ncols = Math.max.apply(null, grid.map(function (r) { return r.length; }));
    for (var pass = 0; pass < ncols + 2; pass++) {
      var split = -1;
      for (var j = 0; j < ncols; j++) {
        var cells = grid.map(function (r) { return j < r.length ? String(r[j]).trim() : ""; })
          .filter(Boolean);
        if (cells.length < 3) continue;
        var matched = cells.map(function (c) { return dateRx.exec(c); });
        var hits = matched.filter(Boolean);
        if (hits.length < 6 && hits.length / cells.length < 0.5) continue;
        var remNum = hits.filter(function (m) { return isNumber(m[2]); }).length;
        if (remNum > hits.length * 0.4) continue;
        split = j; break;
      }
      if (split < 0) break;
      grid = grid.map(function (r) {
        r = r.slice();
        while (r.length < ncols) r.push("");
        var m = dateRx.exec(String(r[split]).trim());
        if (m) return r.slice(0, split).concat([m[1], m[2]], r.slice(split + 1));
        var cell = String(r[split]).trim();
        var filled = r.filter(function (c) { return String(c).trim(); }).length;
        var sp = cell.indexOf(" ");
        if (filled >= 3 && sp > 0) {
          return r.slice(0, split).concat([cell.slice(0, sp), cell.slice(sp + 1).trim()], r.slice(split + 1));
        }
        return r.slice(0, split).concat([r[split], ""], r.slice(split + 1));
      });
      ncols += 1;
    }
    return grid;
  }

  function stackWrappedHeaders(grid) {
    function numericish(row) {
      return row.some(function (c) { return c && (isNumber(c) || isDate(c)); });
    }
    var out = [], i = 0;
    while (i < grid.length) {
      var row = grid[i].slice();
      if (i + 1 < grid.length && !numericish(row) && !numericish(grid[i + 1])) {
        var nxt = grid[i + 1];
        var filledNext = [];
        nxt.forEach(function (c, j) { if (String(c).trim()) filledNext.push(j); });
        var filledCur = {};
        row.forEach(function (c, j) { if (String(c).trim()) filledCur[j] = 1; });
        if (filledNext.length >= 2 && filledNext.every(function (j) { return filledCur[j]; })) {
          filledNext.forEach(function (j) { row[j] = (String(row[j]) + " " + String(nxt[j])).trim(); });
          out.push(row);
          i += 2;
          continue;
        }
      }
      out.push(row);
      i += 1;
    }
    return out;
  }

  /* =====================================================================
     v15 — LOGICAL ROWS for ANY document (not just bank statements)
     1) ruling lines (table borders) read from the PDF's drawing commands
     2) text between two horizontal rules = ONE row (multi-line cells)
     3) borderless tables: wrapped lines merged into the entry above
        (line ran to the column edge / ends with a joiner / lowercase start)
     4) two-sided accounts (T-format P&L / Balance Sheet) split into Dr|Cr
        sides, merged independently, then laid side by side
     ===================================================================== */

  function mulM(A, B) {
    return [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
            A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
            A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
  }
  function apM(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }

  function mergeSegs(list, key, lo, hi) {
    list.sort(function (a, b) { return a[key] - b[key] || a[lo] - b[lo]; });
    var out = [];
    list.forEach(function (s) {
      var last = out[out.length - 1];
      if (last && Math.abs(last[key] - s[key]) <= 1.5 && s[lo] <= last[hi] + 3) {
        last[hi] = Math.max(last[hi], s[hi]);
      } else out.push(JSON.parse(JSON.stringify(s)));
    });
    return out;
  }

  /* horizontal / vertical rules on a page, in the same top-down space as words */
  function extractRules(page, OPS) {
    OPS = OPS || (root.pdfjsLib && root.pdfjsLib.OPS);
    if (!OPS || !page || !page.getOperatorList) return Promise.resolve({ h: [], v: [] });
    var vh = page.view[3] - page.view[1], vw = page.view[2] - page.view[0];
    return page.getOperatorList().then(function (ol) {
      var ctm = [1, 0, 0, 1, 0, 0], stack = [], pend = [], H = [], V = [];
      var fns = ol.fnArray, args = ol.argsArray;
      var STROKE = {}, FILL = {};
      [OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]
        .forEach(function (k) { if (k != null) STROKE[k] = 1; });
      [OPS.fill, OPS.eoFill].forEach(function (k) { if (k != null) FILL[k] = 1; });
      function addH(y, x0, x1) { if (x1 - x0 >= 6) H.push({ y: vh - y, x0: x0, x1: x1 }); }
      function addV(x, y0, y1) { if (y1 - y0 >= 6) V.push({ x: x, y0: vh - y1, y1: vh - y0 }); }
      function commit(stroked) {
        pend.forEach(function (p) {
          if (p.t === "seg") {
            var a = p.a, b = p.b;
            if (!stroked) return;
            if (Math.abs(a[1] - b[1]) <= 1.2) addH((a[1] + b[1]) / 2, Math.min(a[0], b[0]), Math.max(a[0], b[0]));
            else if (Math.abs(a[0] - b[0]) <= 1.2) addV((a[0] + b[0]) / 2, Math.min(a[1], b[1]), Math.max(a[1], b[1]));
          } else {   // box (rectangle or closed axis-aligned subpath)
            var x0 = p.x0, x1 = p.x1, y0 = p.y0, y1 = p.y1, bw = x1 - x0, bh = y1 - y0;
            if (stroked) {
              if (bw >= 6) { addH(y0, x0, x1); addH(y1, x0, x1); }
              if (bh >= 6) { addV(x0, y0, y1); addV(x1, y0, y1); }
            } else {
              if (bh <= 2.5 && bw >= 6) addH((y0 + y1) / 2, x0, x1);
              else if (bw <= 2.5 && bh >= 6) addV((x0 + x1) / 2, y0, y1);
              else if (bw >= 0.3 * vw && bh <= 45) { addH(y0, x0, x1); addH(y1, x0, x1); }   // row banding
            }
          }
        });
        pend = [];
      }
      for (var i = 0; i < fns.length; i++) {
        var fn = fns[i], a = args[i];
        if (fn === OPS.save) stack.push(ctm.slice());
        else if (fn === OPS.restore) { if (stack.length) ctm = stack.pop(); }
        else if (fn === OPS.transform) ctm = mulM(ctm, a);
        else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm.slice()); if (a && a[0]) ctm = mulM(ctm, a[0]); }
        else if (fn === OPS.paintFormXObjectEnd) { if (stack.length) ctm = stack.pop(); }
        else if (fn === OPS.constructPath) {
          var ops = a[0], co = a[1], k = 0, cur = null, start = null, sub = [];
          var flushSub = function () {
            if (sub.length >= 4) {      // closed axis-aligned polygon -> box
              var xs = sub.map(function (p) { return p[0]; }), ys = sub.map(function (p) { return p[1]; });
              var axis = true;
              for (var q = 1; q < sub.length; q++) {
                if (Math.abs(sub[q][0] - sub[q - 1][0]) > 1.2 && Math.abs(sub[q][1] - sub[q - 1][1]) > 1.2) axis = false;
              }
              if (axis) pend.push({ t: "box", x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), y0: Math.min.apply(null, ys), y1: Math.max.apply(null, ys), fillOnly: true });
            }
            sub = [];
          };
          for (var oi = 0; oi < ops.length; oi++) {
            var op = ops[oi];
            if (op === OPS.moveTo) { flushSub(); cur = apM(ctm, co[k], co[k + 1]); start = cur; sub = [cur]; k += 2; }
            else if (op === OPS.lineTo) { var nx = apM(ctm, co[k], co[k + 1]); if (cur) pend.push({ t: "seg", a: cur, b: nx }); cur = nx; sub.push(nx); k += 2; }
            else if (op === OPS.curveTo) { cur = apM(ctm, co[k + 4], co[k + 5]); sub = []; k += 6; }
            else if (op === OPS.curveTo2 || op === OPS.curveTo3) { cur = apM(ctm, co[k + 2], co[k + 3]); sub = []; k += 4; }
            else if (op === OPS.closePath) { if (cur && start) pend.push({ t: "seg", a: cur, b: start }); cur = start; }
            else if (op === OPS.rectangle) {
              var p1 = apM(ctm, co[k], co[k + 1]), p2 = apM(ctm, co[k] + co[k + 2], co[k + 1] + co[k + 3]);
              pend.push({ t: "box", x0: Math.min(p1[0], p2[0]), x1: Math.max(p1[0], p2[0]), y0: Math.min(p1[1], p2[1]), y1: Math.max(p1[1], p2[1]) });
              k += 4;
            }
          }
          flushSub();
        }
        else if (STROKE[fn]) commit(true);
        else if (FILL[fn]) {
          // fill-only: segments are not lines, but filled thin boxes are
          pend = pend.filter(function (p) { return p.t === "box"; });
          commit(false);
        }
        else if (fn === OPS.endPath) pend = [];
      }
      // strokes made of polygon sub-paths were added as boxes too: drop those boxes for stroked (segments cover them)
      return { h: mergeSegs(H, "y", "x0", "x1"), v: mergeSegs(V, "x", "y0", "y1") };
    }).catch(function () { return { h: [], v: [] }; });
  }

  /* cells + per-cell boxes for one word row */
  function rowCellsGeo(r, seps, minGap) {
    var ws = r.slice().sort(function (a, b) { return a.x0 - b.x0; });
    var nb = seps.length + 1, cells = [], boxes = [], fww = [];
    for (var j = 0; j < nb; j++) { cells.push(""); boxes.push(null); fww.push(null); }
    function band(x) { for (var j2 = 0; j2 < seps.length; j2++) if (x < seps[j2]) return j2; return seps.length; }
    function put(j3, w) {
      if (!cells[j3]) {
        // pdf.js items can hold several words: estimate the first word's share
        var t = w.text, fw = (/^\S+/.exec(t) || [t])[0];
        fww[j3] = (w.x1 - w.x0) * (fw.length / Math.max(1, t.length));
      }
      cells[j3] = (cells[j3] ? cells[j3] + " " : "") + w.text;
      var b = boxes[j3];
      boxes[j3] = b ? { x0: Math.min(b.x0, w.x0), x1: Math.max(b.x1, w.x1) } : { x0: w.x0, x1: w.x1 };
    }
    if (!seps.length) { ws.forEach(function (w) { put(0, w); }); return { cells: cells, boxes: boxes, fww: fww }; }
    if (minGap != null && ws.length > 1) {
      var big = 0;
      for (var q = 1; q < ws.length; q++) big = Math.max(big, ws[q].x0 - ws[q - 1].x1);
      if (big < Math.max(minGap, 6)) {           // prose row: keep whole
        var j0 = band((ws[0].x0 + ws[0].x1) / 2);
        ws.forEach(function (w) { put(j0, w); });
        return { cells: cells, boxes: boxes, fww: fww };
      }
    }
    var hMed = ws.map(function (w) { return w.bottom - w.top; }).sort(function (a, b) { return a - b; })[Math.floor(ws.length / 2)] || 8;
    var byCell = {};
    ws.forEach(function (w) { var b2 = band((w.x0 + w.x1) / 2); (byCell[b2] = byCell[b2] || []).push(w); });
    Object.keys(byCell).forEach(function (k) {
      var list = byCell[k];
      list.sort(function (a, b) {
        if (Math.abs(a.top - b.top) > 0.5 * hMed) return a.top - b.top;
        return a.x0 - b.x0;
      });
      list.forEach(function (w) { put(+k, w); });
    });
    return { cells: cells, boxes: boxes, fww: fww };
  }

  function coveringVerticals(V, top, bottom) {
    var mid = (top + bottom) / 2, xs = [];
    V.forEach(function (v) { if (v.y0 - 2 <= mid && mid <= v.y1 + 2) xs.push(v.x); });
    xs.sort(function (a, b) { return a - b; });
    var out = [];
    xs.forEach(function (x) { if (!out.length || x - out[out.length - 1] > 3) out.push(x); });
    return out;
  }

  function joinCell(a, b) {
    if (!a) return b; if (!b) return a;
    return /[-\/]$/.test(a) ? a + b : a + " " + b;
  }
  var AMT_RE = /\d[\d,]*\.\d{2}\b/;
  function hasAmount(cells) { return cells.some(function (c) { return AMT_RE.test(c); }); }

  /* merge lines that sit between the same pair of horizontal rules */
  function groupByRules(lines, H) {
    if (lines.length < 2 || H.length < 3) return lines;
    function sep(A, B) {
      var x0 = Math.min(A.x0, B.x0), x1 = Math.max(A.x1, B.x1), ext = Math.max(1, x1 - x0);
      return H.some(function (h) {
        if (!(h.y > A.bottom - 1.5 && h.y < B.top + 1.5)) return false;
        var ov = Math.min(h.x1, x1) - Math.max(h.x0, x0);
        return ov >= 0.6 * ext;
      });
    }
    function ruleAbove(A) { return H.some(function (h) { return h.y < A.top + 1.5 && h.y > A.top - 30 && Math.min(h.x1, A.x1) - Math.max(h.x0, A.x0) > 0.6 * (A.x1 - A.x0); }); }
    var flags = [], nsep = 0;
    for (var i = 1; i < lines.length; i++) { var s = sep(lines[i - 1], lines[i]); flags.push(s); if (s) nsep++; }
    if (nsep < 3) return lines;
    // amount columns: mostly numbers that are not dates / date fragments / bare years
    var ncol = 0;
    lines.forEach(function (l) { if (l.cells.length > ncol) ncol = l.cells.length; });
    var amtCol = [];
    for (var cj = 0; cj < ncol; cj++) {
      var vals = lines.map(function (l) { return l.cells[cj]; }).filter(Boolean);
      var am = vals.filter(function (v) { return isNumber(v) && !isDate(v) && !PART_DATE.test(v) && !/^(19|20)\d\d$/.test(v); }).length;
      amtCol.push(am >= 2);
    }
    function hasAmt(l) { return l.cells.some(function (c, j) { return c && amtCol[j] && isNumber(c); }); }
    var out = [], grp = [lines[0]], bounded = ruleAbove(lines[0]);
    var lhs = lines.map(function (l) { return l.bottom - l.top; }).sort(function (a, b) { return a - b; });
    var lhm = lhs[Math.floor(lhs.length / 2)] || 10;
    function hugged(g) {   // a real cell sits right against its top and bottom rules
      var f = g[0], z = g[g.length - 1];
      var x0 = Math.min.apply(null, g.map(function (l) { return l.x0; })), x1 = Math.max.apply(null, g.map(function (l) { return l.x1; }));
      function near(y0, y1) { return H.some(function (h) { return h.y >= y0 && h.y <= y1 && Math.min(h.x1, x1) - Math.max(h.x0, x0) > 0.6 * (x1 - x0); }); }
      return near(f.top - 1.2 * lhm, f.top + 1.5) && near(z.bottom - 1.5, z.bottom + 1.2 * lhm);
    }
    function flush(closedBelow) {
      var ok = grp.length > 1 && grp.length <= 8 && bounded && closedBelow &&
               grp.filter(hasAmt).length <= 1 && hugged(grp);
      if (!ok) { grp.forEach(function (l) { out.push(l); }); return; }
      var m = { y: grp[0].y, top: grp[0].top, bottom: grp[grp.length - 1].bottom, page: grp[0].page,
                x0: Math.min.apply(null, grp.map(function (l) { return l.x0; })),
                x1: Math.max.apply(null, grp.map(function (l) { return l.x1; })),
                cells: [], boxes: [], merged: grp.length, rb: grp[0].rb, seps: grp[0].seps, ruled: grp[0].ruled };
      var n = Math.max.apply(null, grp.map(function (l) { return l.cells.length; }));
      for (var j = 0; j < n; j++) {
        var t = "", b = null;
        grp.forEach(function (l) {
          if (l.cells[j]) t = joinCell(t, l.cells[j]);
          var bb = l.boxes[j];
          if (bb) b = b ? { x0: Math.min(b.x0, bb.x0), x1: Math.max(b.x1, bb.x1) } : { x0: bb.x0, x1: bb.x1 };
        });
        m.cells.push(t); m.boxes.push(b);
        var fw0 = null; grp.forEach(function (l) { if (fw0 == null && l.cells[j] && l.fww) fw0 = l.fww[j]; });
        (m.fww = m.fww || []).push(fw0);
      }
      out.push(m);
    }
    for (var k = 1; k < lines.length; k++) {
      if (flags[k - 1]) { flush(true); grp = [lines[k]]; bounded = true; }
      else grp.push(lines[k]);
    }
    flush(false);
    return out;
  }

  /* '01-APR-' + '2025' on the next line -> '01-APR-2025' */
  var PART_DATE = /^\d{1,2}[-\/. ](?:[A-Za-z]{3,9}|\d{1,2})[-\/. ]?$/;
  function joinPartialDates(lines) {
    for (var i = 0; i + 1 < lines.length; i++) {
      var A = lines[i], B = lines[i + 1], moved = false;
      if (A.page !== B.page) continue;
      for (var j = 0; j < A.cells.length; j++) {
        var c = A.cells[j];
        if (c && PART_DATE.test(c) && !parseDate(c) && B.cells[j] && /^\d{2,4}$/.test(B.cells[j])) {
          A.cells[j] = /[-\/. ]$/.test(c) ? c + B.cells[j] : c + "-" + B.cells[j];
          B.cells[j] = ""; B.boxes[j] = null; moved = true;
        }
      }
      if (moved && !B.cells.some(Boolean)) { lines.splice(i + 1, 1); }
    }
    return lines;
  }

  /* build y-aware lines with cells+boxes for one geometry variant */
  function buildLines(wordsPages, rulesPages, opt) {
    var rowsPages = wordsPages.map(clusterRows);
    var globalSeps = null;
    if (opt.scope === "global") {
      var basis = [];
      rowsPages.forEach(function (rows) { rows.forEach(function (r) { basis.push(r); }); });
      globalSeps = findBounds(basis, opt.mg, opt.tf);
    }
    var pagesLines = [], offset = 0;
    rowsPages.forEach(function (rows, p) {
      var R = (rulesPages && rulesPages[p]) || { h: [], v: [] };
      var seps = globalSeps || findBounds(rows, opt.mg, opt.tf);
      var lines = [];
      rows.forEach(function (r) {
        var top = Infinity, bottom = -Infinity, x0 = Infinity, x1 = -Infinity;
        r.forEach(function (w) { top = Math.min(top, w.top); bottom = Math.max(bottom, w.bottom); x0 = Math.min(x0, w.x0); x1 = Math.max(x1, w.x1); });
        var useSeps = seps, ruled = false;
        if (opt.ruled) {
          var xs = coveringVerticals(R.v, top, bottom);
          if (xs.length >= 3) {
            // outer table borders: drop them when no text lies outside
            var cxs = r.map(function (w) { return (w.x0 + w.x1) / 2; });
            if (!cxs.some(function (c) { return c < xs[0]; })) xs = xs.slice(1);
            if (xs.length && !cxs.some(function (c) { return c > xs[xs.length - 1]; })) xs = xs.slice(0, -1);
            if (xs.length >= 1) { useSeps = xs; ruled = true; }
          }
        }
        var g = rowCellsGeo(r, useSeps, opt.mg);
        if (!g.cells.some(Boolean)) return;
        lines.push({ y: top + offset, top: top, bottom: bottom, x0: x0, x1: x1, page: p, ruled: ruled,
                     cells: g.cells, boxes: g.boxes, fww: g.fww, words: r, seps: useSeps,
                     rb: g.cells.map(function (_, j) { return j < useSeps.length ? useSeps[j] : Infinity; }) });
      });
      pagesLines.push(lines);
      offset += 1000;
    });
    realignTextRows(pagesLines, opt.scope === "global");
    var out = [];
    pagesLines.forEach(function (lines, p) {
      var R = (rulesPages && rulesPages[p]) || { h: [], v: [] };
      lines = groupByRules(lines, R.h);
      lines = joinPartialDates(lines);
      lines.forEach(function (l) { out.push(l); });
    });
    return out;
  }

  /* left-aligned headers over right-aligned numbers: put each word of a
     text-only row into the column whose DATA it actually overlaps */
  function realignTextRows(pagesLines, global) {
    // data extents + alignment per column, from rows that hold amounts
    function stats(lines) {
      var ext = {}, num = {}, cnt = {};
      lines.forEach(function (l) {
        if (l.ruled || !hasAmount(l.cells)) return;
        l.boxes.forEach(function (b, j) {
          if (!b || !l.cells[j]) return;
          var e = ext[j];
          ext[j] = e ? [Math.min(e[0], b.x0), Math.max(e[1], b.x1)] : [b.x0, b.x1];
          cnt[j] = (cnt[j] || 0) + 1;
          if (isNumber(l.cells[j])) num[j] = (num[j] || 0) + 1;
        });
      });
      var keys = Object.keys(ext).map(Number).sort(function (a, b) { return a - b; });
      // header separators: a right-aligned number column owns the gutter to its left
      var hs = [];
      for (var i = 0; i + 1 < keys.length; i++) {
        var j = keys[i], k = keys[i + 1];
        var rightNumeric = (num[k] || 0) >= 0.6 * cnt[k];
        hs.push({ left: j, right: k, x: rightNumeric ? ext[j][1] + 1 : (ext[j][1] + ext[k][0]) / 2 });
      }
      return { ext: ext, keys: keys, hs: hs };
    }
    var all = [];
    pagesLines.forEach(function (ls) { ls.forEach(function (l) { all.push(l); }); });
    var G = global ? stats(all) : null;
    pagesLines.forEach(function (lines) {
      var S = G || stats(lines);
      if (S.keys.length < 2) return;
      var firstData = lines.length;
      for (var fi = 0; fi < lines.length; fi++) if (hasAmount(lines[fi].cells)) { firstData = fi; break; }
      lines.forEach(function (l, li) {
        if (l.ruled || hasAmount(l.cells)) return;
        if (l.cells.filter(Boolean).length < 2) return;      // prose / single cell: untouched
        var hdr = li < firstData || l.cells.filter(Boolean).every(function (c) { return !/\d/.test(c) && c === c.toUpperCase(); });
        if (!hdr) return;
        var n = l.cells.length, cells = [], boxes = [], changed = false;
        for (var j = 0; j < n; j++) { cells.push(""); boxes.push(null); }
        // header phrases (words joined by small gaps or stacked over each other)
        var sw = l.words.slice().sort(function (a, b) { return a.x0 - b.x0; });
        var phrases = [];
        sw.forEach(function (w) {
          var p = phrases[phrases.length - 1];
          if (p && (w.x0 - p.x1 < 6 || w.x0 < p.x1)) { p.words.push(w); p.x1 = Math.max(p.x1, w.x1); }
          else phrases.push({ x0: w.x0, x1: w.x1, words: [w] });
        });
        if (phrases.length === S.keys.length && phrases.length >= 3) {
          // one phrase per data column: map in reading order
          phrases.forEach(function (p, pi) {
            var t = S.keys[pi];
            var hMed = 4;
            p.words.sort(function (a, b) { return Math.abs(a.top - b.top) > hMed ? a.top - b.top : a.x0 - b.x0; });
            p.words.forEach(function (w) {
              cells[t] = (cells[t] ? cells[t] + " " : "") + w.text;
              var bb = boxes[t];
              boxes[t] = bb ? { x0: Math.min(bb.x0, w.x0), x1: Math.max(bb.x1, w.x1) } : { x0: w.x0, x1: w.x1 };
            });
          });
          var same = cells.every(function (c, j) { return c === l.cells[j]; });
          if (!same) { l.cells = cells; l.boxes = boxes; l.fww = null; }
          return;
        }
        sw.forEach(function (w) {
          var cx = (w.x0 + w.x1) / 2, band = l.seps.length;
          for (var q = 0; q < l.seps.length; q++) if (cx < l.seps[q]) { band = q; break; }
          var target = band;
          if (S.ext[band]) {
            // walk the data-derived header separators
            var col = S.keys[0];
            S.hs.forEach(function (h) { if (cx >= h.x) col = h.right; });
            if (Math.abs(col - band) === 1) target = col;
          }
          if (target !== band) changed = true;
          cells[target] = (cells[target] ? cells[target] + " " : "") + w.text;
          var bb = boxes[target];
          boxes[target] = bb ? { x0: Math.min(bb.x0, w.x0), x1: Math.max(bb.x1, w.x1) } : { x0: w.x0, x1: w.x1 };
        });
        if (changed) { l.cells = cells; l.boxes = boxes; l.fww = null; }
      });
    });
  }

  /* ---- borderless wrap merge (generic tables) ---- */
  function lastWord(s) { var m = /(\S+)\s*$/.exec(s || ""); return m ? m[1] : ""; }
  function wrapMerge(lines) {
    if (!lines.length) return [];
    var ncols = 0;
    lines.forEach(function (l) { if (l.cells.length > ncols) ncols = l.cells.length; });
    var isNum = [], maxX1 = [], cws = [], hs = [];
    // column statistics come from real table rows only (>=2 filled cells),
    // never from titles / addresses / single-cell prose lines
    var statLines = lines;
    function inCol(l, j) { return l.boxes[j] && (!l.rb || l.boxes[j].x1 <= l.rb[j] + 2); }
    for (var j = 0; j < ncols; j++) {
      var vals = [], x1s = [];
      statLines.forEach(function (l) {
        var c = l.cells[j];
        if (!c) return;
        if (!inCol(l, j)) return;
        vals.push(c);
        if (l.boxes[j]) {
          x1s.push(l.boxes[j].x1);
          if (c.length >= 4) cws.push((l.boxes[j].x1 - l.boxes[j].x0) / c.length);
        }
      });
      var nn = vals.filter(function (v) { return isNumber(v) || isDate(v) || PART_DATE.test(v); }).length;
      isNum.push(vals.length ? nn / vals.length >= 0.6 : false);
      x1s.sort(function (a, b) { return a - b; });
      maxX1.push(x1s.length ? x1s[Math.floor(0.9 * (x1s.length - 1))] : 0);
    }
    lines.forEach(function (l) { hs.push(l.bottom - l.top); });
    cws.sort(function (a, b) { return a - b; }); hs.sort(function (a, b) { return a - b; });
    var cw = cws.length ? cws[Math.floor(cws.length / 2)] : 4;
    var lh = hs.length ? hs[Math.floor(hs.length / 2)] : 10;

    // right edge a wrapped column runs to (max of its cells, robust to 1 outlier)
    var colRight = maxX1.map(function (m, j) {
      var xs = [];
      statLines.forEach(function (l) { if (l.cells[j] && inCol(l, j)) xs.push(l.boxes[j].x1); });
      xs.sort(function (a, b) { return a - b; });
      return xs.length ? xs[xs.length - 1] : m;
    });
    function headerLike(cells) {
      var f = cells.filter(Boolean);
      return f.length >= 2 && f.every(function (c) { return !/\d/.test(c) && c === c.toUpperCase() && c.length <= 30; });
    }
    var recs = [], cur = null;
    function attach(L) {
      if (!cur) return false;
      if (cur.header) return false;
      var A = cur.last;
      if (L.page !== A.page) return false;
      if (L.top - A.bottom > 1.6 * lh) return false;
      var textCont = false;
      for (var j = 0; j < L.cells.length; j++) {
        var c = L.cells[j];
        if (!c) continue;
        if (isNum[j]) {
          if (cur.cells[j] || cur.hasAmt) return false;
          if (!(isNumber(c) || isDate(c))) return false;
          continue;
        }
        var a = A.cells[j], ab = A.boxes[j], lb = L.boxes[j];
        if (!a) return false;
        if (isDate(c)) return false;
        if (!inCol(A, j) || !inCol(L, j)) return false;      // titles / section names spanning columns
        // word-wrap test: the first word of this line could NOT have fitted
        // at the end of the previous line -> it was wrapped there
        var fw = (/^\S+/.exec(c) || [""])[0];
        var fwW = (L.fww && L.fww[j] != null) ? L.fww[j] : cw * fw.length;
        var full = ab && (ab.x1 + Math.max(1.5, cw * 0.5) + fwW) > colRight[j] - Math.max(2.5, cw);
        var joiner = /[-\/,&(:]$/.test(a) || /^(and|of|for|to|the|in|on|at|by|with|from|&)$/i.test(lastWord(a));
        var lower = /^[a-z(]/.test(c);
        var aligned = !ab || !lb || Math.abs(lb.x0 - ab.x0) <= Math.max(2.5 * cw, 5);
        if (!aligned && !lower) return false;
        if (!(full || joiner || lower)) return false;
        textCont = true;
      }
      return textCont;
    }
    lines.forEach(function (L) {
      if (!L.cells.some(Boolean)) return;
      if (attach(L)) {
        for (var j = 0; j < L.cells.length; j++) {
          if (!L.cells[j]) continue;
          cur.cells[j] = joinCell(cur.cells[j] || "", L.cells[j]);
        }
        cur.hasAmt = cur.hasAmt || hasAmount(L.cells);
        cur.last = L;
      } else {
        cur = { cells: L.cells.slice(), last: L, hasAmt: hasAmount(L.cells), y: L.y, page: L.page, header: headerLike(L.cells) };
        while (cur.cells.length < ncols) cur.cells.push("");
        recs.push(cur);
      }
    });
    return recs;
  }

  /* two-sided account (To ... | By ...) or repeated header -> split column */
  function detectSplit(lines) {
    var byCol = {}, toLeft = 0;
    lines.forEach(function (l) {
      l.cells.forEach(function (c, j) {
        if (j > 0 && /^By\s/i.test(c)) byCol[j] = (byCol[j] || 0) + 1;
      });
    });
    var best = null, bc = 0;
    Object.keys(byCol).forEach(function (k) { if (byCol[k] > bc) { bc = byCol[k]; best = +k; } });
    if (best != null && bc >= 2) {
      var firstTB = -1;
      lines.forEach(function (l, li) {
        var hit = false;
        for (var j = 0; j < best; j++) if (/^To\s/i.test(l.cells[j] || "")) { toLeft++; hit = true; break; }
        if ((hit || /^By\s/i.test(l.cells[best] || "")) && firstTB < 0) firstTB = li;
      });
      if (toLeft >= 2) {
        // start at the column-header line just above the first To/By entry, if any
        var st = firstTB;
        for (var bi = firstTB - 1; bi >= Math.max(0, firstTB - 3); bi--) {
          var f = lines[bi].cells.filter(Boolean);
          if (f.length >= 2 && !f.some(function (c) { return isNumber(c); })) { st = bi; break; }
        }
        return { k: best, start: st };
      }
    }
    // paired account headings: LIABILITIES | ASSETS, EXPENDITURE | INCOME, PAYMENTS | RECEIPTS, Dr | Cr
    var PAIRS = [[/liabilit|capital\s*&\s*liab|sources\s*of\s*funds/i, /assets|application\s*of\s*funds/i],
                 [/expenditure|expenses/i, /income|revenue/i], [/payments/i, /receipts/i],
                 [/^dr\.?\b|debit\s*side|^debit$/i, /^cr\.?\b|credit\s*side|^credit$/i]];
    for (var pi = 0; pi < Math.min(lines.length, 60); pi++) {
      var cs = lines[pi].cells;
      if (cs.some(function (c) { return isNumber(c); })) continue;
      for (var pp = 0; pp < PAIRS.length; pp++) {
        var li = -1, ri = -1;
        for (var cj = 0; cj < cs.length; cj++) {
          if (!cs[cj]) continue;
          if (li < 0 && PAIRS[pp][0].test(cs[cj])) li = cj;
          else if (li >= 0 && ri < 0 && cj > li + 1 && PAIRS[pp][1].test(cs[cj])) ri = cj;
        }
        if (li >= 0 && ri > li + 1) return { k: ri, start: pi };
      }
    }
    // repeated header: e.g. PARTICULARS AMOUNT AMOUNT | PARTICULARS AMOUNT AMOUNT
    for (var i = 0; i < Math.min(lines.length, 60); i++) {
      var idx = [], lab = [];
      lines[i].cells.forEach(function (c, j) { if (c) { idx.push(j); lab.push(c.replace(/\s+/g, " ").toUpperCase()); } });
      if (lab.length >= 4 && lab.length % 2 === 0) {
        var h = lab.length / 2, same = true;
        for (var q = 0; q < h; q++) if (lab[q] !== lab[q + h]) same = false;
        if (same && !lab.some(function (x) { return isNumber(x); })) return { k: idx[h], start: i };
      }
    }
    return null;
  }

  function sideLines(lines, a, b) {
    return lines.map(function (l) {
      return { y: l.y, top: l.top, bottom: l.bottom, page: l.page, x0: l.x0, x1: l.x1,
               cells: l.cells.slice(a, b), boxes: l.boxes.slice(a, b), rb: l.rb ? l.rb.slice(a, b) : null,
               fww: l.fww ? l.fww.slice(a, b) : null, src: l };
    }).filter(function (l) { return l.cells.some(Boolean); });
  }

  /* lines -> grid of logical rows (generic path) */
  function linesToGrid(lines) {
    if (!lines.length) return [];
    var ncols = 0;
    lines.forEach(function (l) { if (l.cells.length > ncols) ncols = l.cells.length; });
    var hs = lines.map(function (l) { return l.bottom - l.top; }).sort(function (a, b) { return a - b; });
    var lh = hs[Math.floor(hs.length / 2)] || 10;
    function pad(cells, w) { var c = (cells || []).slice(); while (c.length < w) c.push(""); return c; }

    var grid = [], pos = 0, guard = 0;
    while (pos < lines.length && guard++ < 50) {
      var rest = lines.slice(pos);
      var sp = detectSplit(rest);
      if (sp == null) { wrapMerge(rest).forEach(function (r) { grid.push(r.cells); }); break; }
      var start = pos + sp.start, k = sp.k;
      // lines before this two-sided block
      wrapMerge(lines.slice(pos, start)).forEach(function (r) { grid.push(r.cells); });
      // block runs until a large vertical gap, a page change, or the next account header
      var end = start + 1;
      while (end < lines.length) {
        var A = lines[end - 1], B = lines[end];
        if (B.page !== A.page || B.top - A.bottom > 2.5 * lh) break;
        var nx = detectSplit([B]);
        if (end > start + 1 && nx && nx.start === 0) break;
        end++;
      }
      var body = lines.slice(start, end);
      var L = wrapMerge(sideLines(body, 0, k)), Rr = wrapMerge(sideLines(body, k, ncols));
      // a shared closing line (totals) stays aligned on both sides
      var tail = null;
      if (L.length && Rr.length && L[L.length - 1].last.src === Rr[Rr.length - 1].last.src && L.length !== Rr.length) tail = [L.pop(), Rr.pop()];
      var n = Math.max(L.length, Rr.length);
      for (var i = 0; i < n; i++) grid.push(pad(L[i] && L[i].cells, k).concat(pad(Rr[i] && Rr[i].cells, ncols - k)));
      if (tail) grid.push(pad(tail[0].cells, k).concat(pad(tail[1].cells, ncols - k)));
      pos = end;
    }
    return grid;
  }

  /* ---- statement semantics (v13: nearest-anchor transaction grouping) ---- */

  var HDR = {
    date: [/^(txn|tran(saction)?|post(ing)?)?\s*\.?\s*date$/, /^date$/, /trans?\.?\s*date/, /^txn\.?\s*dt\.?$/],
    value_date: [/value\s*date/, /^val\.?\s*dt\.?$/],
    particulars: [/particulars?/, /narration/, /description/, /details/, /transaction\s*(details|remarks)/, /remarks/],
    ref: [/(cheque|chq|cheq)\.?\s*(no|num|#)?/, /ref(erence)?\.?\s*(no|num|#)?/, /utr/, /instrument/],
    debit: [/withdrawal(\s*\(?dr\.?\)?)?(\s*(amt|amount))?/, /debits?(\s*amount)?/, /^dr\.?$/, /paid\s*out/, /withdrawals?/],
    credit: [/deposits?(\s*\(?cr\.?\)?)?(\s*(amt|amount))?/, /credits?(\s*amount)?/, /^cr\.?$/, /paid\s*in/],
    balance: [/(closing\s*|running\s*)?balance/, /^bal\.?$/]
  };
  var SKIP_RE = /closing\s*balance|balance\s*c\/?f|carried\s*forward|^total\b|grand\s*total|statement\s*summary|page\s*\d+\s*(of|\/)|computer\s*generated|transaction\s*total|legends?\b|end\s*of\s*statement/i;
  var OPEN_RE = /opening\s*balance|balance\s*b\/?f|brought\s*forward|^\s*b\s*\/\s*f\b/i;

  function matchHeaders(row) {
    var mapping = {}, used = {};
    for (var idx = 0; idx < row.length; idx++) {
      var c = String(row[idx] || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (!c) continue;
      for (var canon in HDR) {
        if (used[canon]) continue;
        if (HDR[canon].some(function (p) { return p.test(c); })) {
          mapping[idx] = canon; used[canon] = 1; break;
        }
      }
    }
    var n = Object.keys(mapping).length;
    if (n >= 3 && (used.debit || used.credit) && used.balance) return mapping;
    return null;
  }

  function findHeader(grid) {   // scan the WHOLE grid — statements have long preambles
    for (var i = 0; i < grid.length; i++) {
      var m = matchHeaders(grid[i]);
      if (m) return { index: i, mapping: m };
    }
    return null;
  }

  function leadDate(s) {
    s = String(s || "").trim();
    if (!s) return { d: null, rest: "" };
    var d = parseDate(s);
    if (d) return { d: d, rest: "" };
    var parts = s.split(/\s+/);
    d = parseDate(parts[0]);
    if (d) return { d: d, rest: parts.slice(1).join(" ") };
    return { d: null, rest: s };
  }

  function columnKinds(body, ncols) {
    var kinds = [];
    for (var j = 0; j < ncols; j++) {
      var vals = body.map(function (r) { return String(r[j] || "").trim(); }).filter(Boolean);
      if (!vals.length) { kinds.push(["empty", 0]); continue; }
      var nd = vals.filter(isDate).length, nn = vals.filter(isNumber).length;
      if (nd / vals.length >= 0.6) kinds.push(["date", vals.length]);
      else if (nn / vals.length >= 0.6) kinds.push(["amount", vals.length]);
      else kinds.push(["text", vals.length]);
    }
    return kinds;
  }

  function repairMapping(body, ncols, mapping) {
    var kinds = columnKinds(body, ncols);
    var used = {};
    for (var k in mapping) used[mapping[k]] = 1;
    for (var idx in mapping) {
      var canon = mapping[idx], kind = kinds[idx] ? kinds[idx][0] : "empty";
      if ((canon === "debit" || canon === "credit" || canon === "balance") && kind === "date") {
        delete used[canon]; delete mapping[idx];
      } else if ((canon === "date" || canon === "value_date") && kind === "amount") {
        delete used[canon]; delete mapping[idx];
      }
    }
    var j, dateCols = [], amountCols = [];
    for (j = 0; j < ncols; j++) if (kinds[j][0] === "date" && !(j in mapping)) dateCols.push(j);
    if (!used.date && dateCols.length) { mapping[dateCols.shift()] = "date"; used.date = 1; }
    if (!used.value_date && dateCols.length) { mapping[dateCols.shift()] = "value_date"; used.value_date = 1; }
    for (j = 0; j < ncols; j++) if (kinds[j][0] === "amount" && !(j in mapping)) amountCols.push(j);
    if (!used.balance && amountCols.length) { mapping[amountCols.pop()] = "balance"; used.balance = 1; }
    if (!used.debit && amountCols.length) { mapping[amountCols.shift()] = "debit"; used.debit = 1; }
    if (!used.credit && amountCols.length) { mapping[amountCols.shift()] = "credit"; used.credit = 1; }
    if (!used.particulars) {
      var best = -1, bestN = -1;
      for (j = 0; j < ncols; j++) {
        if (kinds[j][0] === "text" && !(j in mapping) && kinds[j][1] > bestN) { bestN = kinds[j][1]; best = j; }
      }
      if (best >= 0) { mapping[best] = "particulars"; used.particulars = 1; }
    }
    return mapping;
  }

  function reconstructLines(lines) {
    var grid = lines.map(function (l) { return l.cells; });
    var fh = findHeader(grid);
    if (!fh) throw new Error("no bank-statement header found");
    var hi = fh.index;
    var ncols = 0;
    grid.forEach(function (r) { if (r.length > ncols) ncols = r.length; });
    var bodyCells = grid.slice(hi + 1);
    var mapping = repairMapping(bodyCells, ncols, fh.mapping);
    var inv = {};
    for (var k in mapping) inv[mapping[k]] = +k;
    var headerCells = grid[hi];
    var extraCols = [];
    for (var j = 0; j < ncols; j++) {
      if (!(j in mapping) && bodyCells.some(function (r) { return j < r.length && String(r[j]).trim(); })) extraCols.push(j);
    }
    var extraHeaders = extraCols.map(function (jj) {
      var t = jj < headerCells.length ? String(headerCells[jj]).trim() : "";
      return t || ("Col " + (jj + 1));
    });
    var preamble = [];
    lines.slice(0, hi).forEach(function (l) {
      var txt = l.cells.filter(Boolean).join("  ");
      if (txt) preamble.push(txt);
    });

    function cellOf(cells, canon) {
      var idx = inv[canon];
      return idx != null && idx < cells.length ? String(cells[idx]).trim() : "";
    }

    var warnings = [], opening = null, work = [];
    lines.slice(hi + 1).forEach(function (l) {
      var joined = l.cells.join(" ").trim();
      if (!joined) return;
      if (OPEN_RE.test(joined)) {
        for (var i2 = l.cells.length - 1; i2 >= 0; i2--) {
          var v = parseNumber(l.cells[i2]);
          if (v !== null) { opening = v; break; }
        }
        return;
      }
      if (SKIP_RE.test(joined)) return;
      if (matchHeaders(l.cells)) return;  // repeated header
      work.push(l);
    });

    var anchors = [], ay = [];
    work.forEach(function (l, i) {
      if (leadDate(cellOf(l.cells, "date")).d) { anchors.push(i); ay.push(l.y); }
    });
    if (!anchors.length) throw new Error("no dated transaction lines found");
    var groups = {};
    anchors.forEach(function (a) { groups[a] = [a]; });
    var owner = {};
    anchors.forEach(function (a) { owner[a] = a; });
    // between two consecutive dated lines, the record boundary is the LARGEST
    // vertical gap (works whether narration sits above or below the date line);
    // ties fall back to the nearest dated line
    for (var ai = 0; ai + 1 < anchors.length; ai++) {
      var a0 = anchors[ai], a1 = anchors[ai + 1];
      if (a1 - a0 < 2) continue;
      var gaps = [];
      for (var q = a0; q < a1; q++) gaps.push({ at: q, g: work[q + 1].y - work[q].y });
      var sorted = gaps.slice().sort(function (x, y2) { return y2.g - x.g; });
      if (sorted.length > 1 && sorted[0].g - sorted[1].g >= 0.8) {
        for (var q2 = a0 + 1; q2 < a1; q2++) owner[q2] = (q2 <= sorted[0].at) ? a0 : a1;
      }
    }
    work.forEach(function (l, i) {
      if (groups[i]) return;
      if (owner[i] != null) { groups[owner[i]].push(i); return; }
      var best = null, bestD = null;
      for (var k2 = 0; k2 < anchors.length; k2++) {
        var d2 = Math.abs(l.y - ay[k2]);
        if (bestD === null || d2 < bestD) { bestD = d2; best = anchors[k2]; }
      }
      if (best !== null) groups[best].push(i);
    });

    var rows = [];
    anchors.forEach(function (a) {
      var members = groups[a].slice().sort(function (x, y2) { return work[x].y - work[y2].y; });
      var acells = work[a].cells;
      function firstNum(canon) {
        var v = parseNumber(cellOf(acells, canon));
        if (v !== null) return v;
        for (var m2 = 0; m2 < members.length; m2++) {
          if (members[m2] === a) continue;
          v = parseNumber(cellOf(work[members[m2]].cells, canon));
          if (v !== null) return v;
        }
        return null;
      }
      function joinedText(canon) {
        var parts = [];
        members.forEach(function (m2) {
          var t = cellOf(work[m2].cells, canon);
          if (t) parts.push(t);
        });
        return parts.join(" ").trim();
      }
      var extras = extraCols.map(function (jj) {
        var parts = [];
        members.forEach(function (m2) {
          var c3 = work[m2].cells;
          var t = jj < c3.length ? String(c3[jj]).trim() : "";
          if (t) parts.push(t);
        });
        return parts.join(" ").trim();
      });
      var ld = leadDate(cellOf(acells, "date"));
      var refTxt = joinedText("ref");
      if (ld.rest) refTxt = (ld.rest + " " + refTxt).trim();
      var vd = parseDate(cellOf(acells, "value_date"));
      rows.push({
        date: ld.d ? ld.d.str : cellOf(acells, "date"),
        value_date: vd ? vd.str : cellOf(acells, "value_date"),
        particulars: joinedText("particulars"), ref: refTxt,
        debit: firstNum("debit"), credit: firstNum("credit"), balance: firstNum("balance"),
        extras: extras
      });
    });

    var ok = 0, bad = 0, badRows = [], missingBal = 0, prev = opening;
    rows.forEach(function (r, i) {
      if (r.balance === null) { missingBal++; badRows.push(i + 1); return; }
      if (prev !== null) {
        var expect = Math.round((prev - (r.debit || 0) + (r.credit || 0)) * 100) / 100;
        if (Math.abs(expect - r.balance) <= 0.011) ok++;
        else { bad++; badRows.push(i + 1); }
      }
      prev = r.balance;
    });
    var totDeb = 0, totCre = 0;
    rows.forEach(function (r) { totDeb += r.debit || 0; totCre += r.credit || 0; });
    totDeb = Math.round(totDeb * 100) / 100;
    totCre = Math.round(totCre * 100) / 100;
    var closing = null;
    for (var i3 = rows.length - 1; i3 >= 0; i3--) {
      if (rows[i3].balance !== null) { closing = rows[i3].balance; break; }
    }
    if (opening === null && rows.length) warnings.push("Opening balance row not found — continuity checked from the first transaction.");
    if (missingBal) warnings.push(missingBal + " row(s) have no readable balance — flagged for review.");
    if (bad) warnings.push(bad + " row(s) failed balance continuity — see the REVIEW column.");
    var checked = ok + bad;
    return {
      rows: rows, opening: opening, closing: closing,
      totalDebits: totDeb, totalCredits: totCre,
      ok: ok, bad: bad, badRows: badRows, missingBal: missingBal,
      confidence: checked ? Math.round(1000 * ok / checked) / 10 : 0,
      strict: rows.length ? Math.round(1000 * ok / rows.length) / 10 : 0,
      warnings: warnings, preamble: preamble, extraHeaders: extraHeaders
    };
  }

  function isStatementGrid(grid) { return findHeader(grid) !== null; }

  /* judge candidates over geometry variants:
     statements -> strict balance-continuity; other docs -> structural score */
  function bestExtraction(wordsPages, rulesPages) {
    rulesPages = rulesPages || wordsPages.map(function () { return { h: [], v: [] }; });
    var hasV = rulesPages.some(function (r) { return r && r.v && r.v.length >= 3; });
    var mgs = [4, 7, 11], tfs = [0.08, 0.2];
    var variants = [];
    mgs.forEach(function (mg) {
      tfs.forEach(function (tf) {
        variants.push({ mg: mg, tf: tf, scope: "global", ruled: false });
        variants.push({ mg: mg, tf: tf, scope: "page", ruled: false });
        if (hasV) {
          variants.push({ mg: mg, tf: tf, scope: "global", ruled: true });
          variants.push({ mg: mg, tf: tf, scope: "page", ruled: true });
        }
      });
    });
    var bestStmt = null, bestGen = null;
    variants.forEach(function (v) {
      var lines;
      try { lines = buildLines(wordsPages, rulesPages, v); } catch (e) { return; }
      if (!lines.length) return;
      var tag = (v.ruled ? "ruled-" : "") + v.scope + "-" + v.mg + "-" + v.tf;
      // statement candidate
      try {
        var st = reconstructLines(lines);
        if (!bestStmt) bestStmt = { tag: tag, stmt: st };
        else {
          var a = st, b = bestStmt.stmt;
          if (a.strict > b.strict || (a.strict === b.strict && (a.confidence > b.confidence ||
              (a.confidence === b.confidence && (a.rows.length > b.rows.length ||
              (a.rows.length === b.rows.length && v.ruled && bestStmt.tag.indexOf("ruled") !== 0)))))) bestStmt = { tag: tag, stmt: st };
        }
      } catch (e) {}
      // generic candidate (per page, logical rows)
      var pages = [];
      for (var p = 0; p < wordsPages.length; p++) {
        var pl = lines.filter(function (l) { return l.page === p; });
        pages.push(cleanGrid(linesToGrid(pl), false));
      }
      var comb = [], width = 0;
      pages.forEach(function (g) { g.forEach(function (r) { if (r.length > width) width = r.length; }); });
      pages.forEach(function (g) { g.forEach(function (r) { var rr = r.slice(); while (rr.length < width) rr.push(""); comb.push(rr); }); });
      var score = scoreGrid(comb);
      var ruledShare = lines.filter(function (l) { return l.ruled; }).length / lines.length;
      if (v.ruled && ruledShare >= 0.3) score += 6;      // drawn borders are ground truth
      if (!bestGen || score > bestGen.score) bestGen = { tag: tag, pages: pages, combined: comb, score: score };
    });
    var winner = bestGen || { tag: "none", pages: [], combined: [], score: 0 };
    winner.pages = winner.pages.map(function (g) { return stackWrappedHeaders(splitLeadingDateColumns(g)); });
    var comb2 = [];
    winner.pages.forEach(function (g) { g.forEach(function (r) { comb2.push(r); }); });
    winner.combined = comb2;
    winner.stmt = bestStmt ? bestStmt.stmt : null;
    if (bestStmt) winner.tag = bestStmt.tag;
    return winner;
  }

  /* ---- styled .xlsx writer (real borders, header fill, review highlight) ----
     SheetJS community edition cannot write styles, so the Statement workbook
     is built directly as OOXML via JSZip — matching desktop-grade output. */

  function xesc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
  }
  function colName(n) {
    var s = "";
    while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }

  var XLSX_STYLES =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>' +
    '<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font>' +
    '<font><i/><color rgb="FF555555"/><sz val="9"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="4"><fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF1F6FEB"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFE0E0"/></patternFill></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left style="thin"><color rgb="FFD0D7DE"/></left><right style="thin"><color rgb="FFD0D7DE"/></right>' +
    '<top style="thin"><color rgb="FFD0D7DE"/></top><bottom style="thin"><color rgb="FFD0D7DE"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="8">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +                                    /* 0 default */
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' + /* 1 header */
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment wrapText="0"/></xf>' + /* 2 text cell */
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +      /* 3 num cell */
    '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>' +                /* 4 bad text */
    '<xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>' + /* 5 bad num */
    '<xf numFmtId="164" fontId="3" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>' + /* 6 totals */
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +                                /* 7 preamble */
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  /* rows: array of arrays of {v, s, n} (value, styleIdx, isNumber) */
  function sheetXml(rows, colWidths, freezeRow) {
    var x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
    if (freezeRow) {
      x += '<sheetViews><sheetView workbookViewId="0"><pane ySplit="' + (freezeRow - 1) +
           '" topLeftCell="A' + freezeRow + '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
    } else {
      x += '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
    }
    if (colWidths && colWidths.length) {
      x += "<cols>";
      colWidths.forEach(function (w, i) {
        x += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
      });
      x += "</cols>";
    }
    x += "<sheetData>";
    rows.forEach(function (r, ri) {
      x += '<row r="' + (ri + 1) + '">';
      r.forEach(function (c, ci) {
        if (c == null || c.v === "" || c.v == null) {
          if (c && c.s) x += '<c r="' + colName(ci + 1) + (ri + 1) + '" s="' + c.s + '"/>';
          return;
        }
        var ref = colName(ci + 1) + (ri + 1);
        if (c.n) {
          x += '<c r="' + ref + '" s="' + (c.s || 0) + '"><v>' + c.v + "</v></c>";
        } else {
          x += '<c r="' + ref + '" s="' + (c.s || 0) + '" t="inlineStr"><is><t xml:space="preserve">' +
               xesc(c.v) + "</t></is></c>";
        }
      });
      x += "</row>";
    });
    x += "</sheetData></worksheet>";
    return x;
  }

  function buildStyledWorkbook(sheets) {   /* sheets: [{name, rows, widths, freeze}] */
    return L.ensure("jszip").then(function () {
      var zip = new root.JSZip();
      var ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>';
      var wbXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>';
      var relXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
      sheets.forEach(function (sh, i) {
        var n = i + 1;
        ct += '<Override PartName="/xl/worksheets/sheet' + n + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
        wbXml += '<sheet name="' + xesc(sh.name) + '" sheetId="' + n + '" r:id="rId' + n + '"/>';
        relXml += '<Relationship Id="rId' + n + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + n + '.xml"/>';
        zip.file("xl/worksheets/sheet" + n + ".xml", sheetXml(sh.rows, sh.widths, sh.freeze));
      });
      ct += '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
            '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
      wbXml += "</sheets></workbook>";
      relXml += '<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
      zip.file("[Content_Types].xml", ct);
      zip.file("_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
      zip.file("xl/workbook.xml", wbXml);
      zip.file("xl/_rels/workbook.xml.rels", relXml);
      zip.file("xl/styles.xml", XLSX_STYLES);
      return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    });
  }


  function genericSheets(pages, oneSheet, meta) {
    function toRows(grid) {
      var ncols = 0;
      grid.forEach(function (r) { if (r.length > ncols) ncols = r.length; });
      var widths = [];
      for (var j = 0; j < ncols; j++) widths.push(9);
      // header = richest all-text row appearing before the first numeric row
      var firstNum = grid.length;
      for (var k = 0; k < grid.length; k++) {
        if (grid[k].some(function (c) { return c && isNumber(c); })) { firstNum = k; break; }
      }
      var headerIdx = -1, headerFilled = 2;
      for (var k2 = 0; k2 < firstNum; k2++) {
        var fc = grid[k2].filter(function (c) { return String(c).trim(); }).length;
        var num = grid[k2].some(function (c) { return c && isNumber(c); });
        if (!num && fc > headerFilled) { headerFilled = fc; headerIdx = k2; }
      }
      var rows = grid.map(function (r, ri) {
        var isHeader = ri === headerIdx;
        return r.map(function (c, j) {
          var t = String(c == null ? "" : c).trim();
          if (t.length + 2 > widths[j]) widths[j] = Math.min(60, t.length + 2);
          if (!t) return { v: "", s: 2 };
          if (isHeader) return { v: t, s: 1 };
          var n = parseNumber(t);
          if (n !== null && t.length <= 18) return { v: n, s: 3, n: true };
          var d = parseDate(t);
          if (d) return { v: d.str, s: 2 };
          return { v: t, s: 2 };
        });
      });
      return { rows: rows, widths: widths };
    }
    var sheets = [];
    if (oneSheet) {
      var comb = [];
      pages.forEach(function (g) { g.forEach(function (r) { comb.push(r); }); });
      var t1 = toRows(comb.length ? comb : [[""]]);
      sheets.push({ name: "Data", rows: t1.rows, widths: t1.widths });
    } else {
      pages.forEach(function (g, i) {
        if (!g.length) return;
        var t2 = toRows(g);
        sheets.push({ name: "Page " + (i + 1), rows: t2.rows, widths: t2.widths });
      });
      if (!sheets.length) sheets.push({ name: "Data", rows: [[{ v: "", s: 0 }]], widths: [9] });
    }
    if (meta && meta.length) {
      sheets.push({ name: "Conversion Info",
                    rows: meta.map(function (m) { return [{ v: m, s: 0 }]; }), widths: [80] });
    }
    return sheets;
  }

  function statementSheets(st, sourceName) {
    var extras = st.extraHeaders || [];
    var rows = [];
    (st.preamble || []).slice(0, 30).forEach(function (p2) {
      rows.push([{ v: p2, s: 7 }]);
    });
    if (rows.length) rows.push([]);
    var headers = ["Date", "Value Date", "Particulars", "Ref / Cheque No",
                   "Withdrawal (Dr)", "Deposit (Cr)", "Balance"].concat(extras, ["REVIEW"]);
    rows.push(headers.map(function (h) { return { v: h, s: 1 }; }));
    var freeze = rows.length + 1;
    var badSet = {};
    st.badRows.forEach(function (i) { badSet[i] = 1; });
    st.rows.forEach(function (r, i) {
      var bad = badSet[i + 1];
      var tS = bad ? 4 : 2, nS = bad ? 5 : 3;
      var line = [
        { v: r.date, s: tS }, { v: r.value_date, s: tS }, { v: r.particulars, s: tS }, { v: r.ref, s: tS },
        { v: r.debit != null ? r.debit : "", s: nS, n: r.debit != null },
        { v: r.credit != null ? r.credit : "", s: nS, n: r.credit != null },
        { v: r.balance != null ? r.balance : "", s: nS, n: r.balance != null }
      ];
      (r.extras || []).forEach(function (x2) { line.push({ v: x2, s: tS }); });
      while (line.length < headers.length - 1) line.push({ v: "", s: tS });
      line.push({ v: bad ? "CHECK" : "", s: tS });
      rows.push(line);
    });
    var total = [{ v: "", s: 2 }, { v: "", s: 2 }, { v: "TOTAL", s: 6 }, { v: "", s: 2 },
                 { v: st.totalDebits, s: 6, n: true }, { v: st.totalCredits, s: 6, n: true }, { v: "", s: 2 }];
    while (total.length < headers.length) total.push({ v: "", s: 2 });
    rows.push(total);
    var widths = [12, 12, 58, 18, 14, 14, 15];
    extras.forEach(function () { widths.push(10); });
    widths.push(9);
    var v = [[{ v: "ProPDF Conversion Validation", s: 3 }], []].concat([
      ["Transactions extracted", st.rows.length, true],
      ["Opening balance", st.opening != null ? st.opening : "not found", st.opening != null],
      ["Closing balance", st.closing != null ? st.closing : "not found", st.closing != null],
      ["Total withdrawals (Dr)", st.totalDebits, true],
      ["Total deposits (Cr)", st.totalCredits, true],
      ["Balance-continuity checks passed", st.ok, true],
      ["Balance-continuity checks FAILED", st.bad, true],
      ["Rows without readable balance", st.missingBal, true],
      ["Continuity confidence", st.confidence + "%", false],
      ["Rows needing manual review (REVIEW column)", st.badRows.join(", ") || "none", false],
      ["Source", sourceName || "", false]
    ].map(function (kv) {
      return [{ v: kv[0], s: 2 }, { v: kv[1], s: kv[2] ? 3 : 2, n: !!kv[2] }];
    }));
    (st.warnings || []).forEach(function (w2) { v.push([{ v: "WARNING", s: 2 }, { v: w2, s: 2 }]); });
    return [
      { name: "Statement", rows: rows, widths: widths, freeze: freeze },
      { name: "Validation", rows: v, widths: [44, 60] }
    ];
  }

  var XT = {
    parseNumber: parseNumber, parseDate: parseDate, isNumber: isNumber, isDate: isDate,
    clusterRows: clusterRows, findBounds: findBounds, applyBounds: applyBounds,
    cleanGrid: cleanGrid, globalGrids: globalGrids, scoreGrid: scoreGrid,
    globalStreamLines: globalStreamLines, matchHeaders: matchHeaders, findHeader: findHeader,
    leadDate: leadDate, repairMapping: repairMapping, reconstructLines: reconstructLines,
    isStatementGrid: isStatementGrid, bestExtraction: bestExtraction,
    extractRules: extractRules, buildLines: buildLines, wrapMerge: wrapMerge, linesToGrid: linesToGrid,
    detectSplit: detectSplit, groupByRules: groupByRules,
    stackWrappedHeaders: stackWrappedHeaders, splitLeadingDateColumns: splitLeadingDateColumns, genericSheets: genericSheets,
    statementSheets: statementSheets, sheetXml: sheetXml
  };
  if (typeof module !== "undefined" && module.exports) { module.exports = XT; return; }
  root.ProPDFXtract = XT;

  /* ======================= browser integration ======================= */

  var P = root.ProPDF, L = root.ProPDFLibs;
  if (!P || !L) return;
  var el = P.el;

  function row(html) { return el("div", { class: "controls" }, html); }
  function field(label, inner) { return '<div class="field"><label>' + label + '</label>' + inner + '</div>'; }

  var OCR_OPTS = '<option value="eng">English</option><option value="eng+hin">English + Hindi</option>' +
    '<option value="eng+mar">English + Marathi</option><option value="eng+guj">English + Gujarati</option>' +
    '<option value="eng+tam">English + Tamil</option><option value="eng+tel">English + Telugu</option>' +
    '<option value="eng+kan">English + Kannada</option><option value="eng+ben">English + Bengali</option>' +
    '<option value="eng+pan">English + Punjabi</option>';

  function openPdf(file) {
    return Promise.all([L.ensure("pdfjs"), P.readAB(file)]).then(function (r) {
      var ab = r[1];
      function attempt(pw) {
        var params = { data: ab.slice(0) };
        if (pw != null) params.password = pw;
        return root.pdfjsLib.getDocument(params).promise.catch(function (e) {
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

  function pageWords(page) {
    return page.getTextContent().then(function (tc) {
      var vh = page.view[3] - page.view[1];
      var words = [];
      tc.items.forEach(function (it) {
        var s = (it.str || "").trim();
        if (!s) return;
        var x = it.transform[4], yBase = it.transform[5];
        var h = it.height || Math.abs(it.transform[3]) || 8;
        var w = it.width || s.length * h * 0.5;
        words.push({ x0: x, x1: x + w, top: vh - yBase - h, bottom: vh - yBase + h * 0.25, text: s });
      });
      return words;
    });
  }

  function ocrWords(page, langs, onProgress) {
    var SCALE = 2.8;
    return L.ensure("tesseract").then(function () {
      var vp = page.getViewport({ scale: SCALE });
      var c = document.createElement("canvas");
      c.width = vp.width; c.height = vp.height;
      return page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise.then(function () {
        var T = root.Tesseract;
        var logger = function (m) { if (onProgress && m.status === "recognizing text") onProgress(m.progress || 0); };
        function toWords(data) {
          var out = [], confs = [];
          (data.tsv || "").split(/\r?\n/).forEach(function (ln) {
            var cp = ln.split("\t");
            if (cp.length >= 12 && cp[0] === "5") {
              var conf = parseFloat(cp[10]), t = (cp[11] || "").trim();
              if (!t || (!isNaN(conf) && conf < 30)) return;
              if (!isNaN(conf)) confs.push(conf);
              out.push({ x0: +cp[6] / SCALE, x1: (+cp[6] + +cp[8]) / SCALE,
                         top: +cp[7] / SCALE, bottom: (+cp[7] + +cp[9]) / SCALE, text: t });
            }
          });
          var mean = confs.length ? Math.round(confs.reduce(function (a, b) { return a + b; }, 0) / confs.length * 10) / 10 : 0;
          return { words: out, conf: mean };
        }
        if (T && typeof T.createWorker === "function") {
          return Promise.resolve().then(function () { return T.createWorker(langs, 1, { logger: logger }); })
            .then(function (worker) {
              var ready = (worker.loadLanguage && worker.initialize)
                ? Promise.resolve(worker.load ? worker.load() : null)
                    .then(function () { return worker.loadLanguage(langs); })
                    .then(function () { return worker.initialize(langs); })
                : Promise.resolve();
              return ready
                .then(function () { return worker.recognize(c, {}, { text: true, tsv: true }); })
                .then(function (res) {
                  var data = res.data;
                  return Promise.resolve(worker.terminate ? worker.terminate() : null)
                    .then(function () { return toWords(data); }, function () { return toWords(data); });
                });
            })
            .catch(function () {
              return T.recognize(c, langs, { logger: logger }).then(function (res) { return toWords(res.data); });
            });
        }
        return T.recognize(c, langs, { logger: logger }).then(function (res) { return toWords(res.data); });
      });
    });
  }

  function fmtINR(v) {
    if (v == null) return "";
    var neg = v < 0, s = Math.abs(v).toFixed(2), parts = s.split("."), whole = parts[0];
    if (whole.length > 3) {
      var head = whole.slice(0, -3), tail = whole.slice(-3), out = [];
      while (head.length > 2) { out.unshift(head.slice(-2)); head = head.slice(0, -2); }
      if (head) out.unshift(head);
      whole = out.join(",") + "," + tail;
    }
    return (neg ? "-" : "") + whole + "." + parts[1];
  }

  function saveBlob(name, blob) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  function buildGenericWorkbook(XLSX, pages, oneSheet, meta) {
    var wb = XLSX.utils.book_new();
    function typed(grid) {
      return grid.map(function (r) {
        return r.map(function (cval) {
          var n = parseNumber(cval);
          if (n !== null && String(cval).trim().length <= 18) return n;
          return cval;
        });
      });
    }
    if (oneSheet) {
      var comb = [];
      pages.forEach(function (g) { g.forEach(function (r) { comb.push(r); }); });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(comb.length ? typed(comb) : [[""]]), "Data");
    } else {
      pages.forEach(function (g, i) {
        if (g.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(typed(g)), ("Page " + (i + 1)).slice(0, 31));
      });
      if (!wb.SheetNames.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[""]]), "Data");
    }
    if (meta && meta.length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(meta.map(function (m) { return [m]; })), "Conversion Info");
    }
    return wb;
  }

  var tool = P.getTool ? P.getTool("pdf2excel") : null;
  if (tool) tool.render = function (panel) { renderXtract(panel); };

  function renderXtract(panel) {
    var info = el("div");
    info.style.cssText = "font-size:12px;margin:4px 0 10px;padding:8px 12px;border-radius:8px;background:rgba(31,111,235,.08);border:1px solid rgba(31,111,235,.3);";
    info.innerHTML = "🧠 <strong>Smart converter for any PDF</strong> — statements, ledgers, P&amp;L / Balance Sheets, broker reports, invoices: " +
      "reads the table's own borders, keeps multi-line entries in <strong>one cell</strong>, splits two-sided accounts (Dr | Cr), " +
      "and for bank statements checks every row's balance. 100% in your browser — no uploads.";
    panel.appendChild(info);

    var zone = P.fileZone({ accept: "application/pdf,.pdf", hint: "one PDF (text or scanned)" });
    panel.appendChild(zone.el);
    panel.appendChild(row(
      field("Output layout (non-statement PDFs)", '<select id="xtSheets"><option value="one">One sheet (all pages)</option><option value="multi">One sheet per page</option></select>') +
      field("If scanned, OCR language", '<select id="xtLang">' + OCR_OPTS + "</select>") +
      field("Mode", '<select id="xtMode"><option value="auto">Auto-detect (OCR only if needed)</option><option value="ocr">Force OCR (treat as scanned)</option></select>')
    ));
    var prog = P.progressWidget(), res = P.resultWidget();
    panel.appendChild(prog.el);
    panel.appendChild(res.el);
    var go = el("button", { class: "btn" }, "Extract to Excel ▸");
    panel.appendChild(el("div", { class: "btn-row" })).appendChild(go);

    go.onclick = function () {
      if (!zone.files.length) return P.toast("Add a PDF", true);
      res.clear(); prog.show("Loading engine…"); go.disabled = true;
      var oneSheet = document.getElementById("xtSheets").value === "one";
      var langs = document.getElementById("xtLang").value || "eng";
      var force = document.getElementById("xtMode").value === "ocr";
      var file = zone.files[0];
      var usedOcr = 0, ocrConfs = [];

      openPdf(file).then(function (pdf) {
        var n = pdf.numPages, wordsPages = [], rulesPages = [], i = 1;
        function collect() {
          if (i > n) return done();
          prog.set(((i - 1) / n) * 90, "Reading page " + i + " of " + n + "…");
          return pdf.getPage(i).then(function (page) {
            return pageWords(page).then(function (words) {
              if (!force && words.length >= 5) {
                return extractRules(page).then(function (rl) {
                  wordsPages.push(words); rulesPages.push(rl); i++; return collect();
                });
              }
              prog.set(((i - 1) / n) * 90, "OCR page " + i + " of " + n + "…");
              return ocrWords(page, langs, function (pr) {
                prog.set(((i - 1 + pr) / n) * 90, "OCR page " + i + " of " + n + " — " + Math.round(pr * 100) + "%");
              }).then(function (o) {
                usedOcr++;
                if (o.conf) ocrConfs.push(o.conf);
                wordsPages.push(o.words); rulesPages.push({ h: [], v: [] }); i++; return collect();
              });
            });
          });
        }
        function done() {
          prog.set(93, "Reconstructing table…");
          var winner = bestExtraction(wordsPages, rulesPages);
          var base = file.name.replace(/\.[^.]+$/, "");
          var meanConf = ocrConfs.length ? Math.round(ocrConfs.reduce(function (a, b) { return a + b; }, 0) / ocrConfs.length * 10) / 10 : null;
          var msg;

          function finishMsg(extra) {
            if (usedOcr) {
              extra += "<br>OCR used on " + usedOcr + " page(s)" + (meanConf != null ? ", confidence " + meanConf + "%" : "") + "." +
                       (meanConf != null && meanConf < 80 ? " ⚠️ Low confidence — verify numbers." : "");
            }
            prog.hide(); res.ok(extra); go.disabled = false;
          }

          if (winner && winner.stmt) {
            var st = winner.stmt;
            prog.set(97, "Building styled workbook…");
            return buildStyledWorkbook(statementSheets(st, file.name)).then(function (blob) {
              saveBlob(base + ".xlsx", blob);
              msg = "Bank statement detected — <strong>" + st.rows.length + " transactions</strong>, one row each, from " + n + " page(s).";
              msg += "<br>Totals: Dr " + fmtINR(st.totalDebits) + " / Cr " + fmtINR(st.totalCredits) +
                     (st.closing != null ? " / Closing " + fmtINR(st.closing) : "") + ".";
              msg += "<br>Balance-continuity confidence: <strong>" + st.confidence + "%</strong>" +
                     (st.bad || st.missingBal ? " — ⚠️ " + (st.bad + st.missingBal) + " row(s) flagged in the REVIEW column. Verify them against the PDF."
                                              : " ✔ every row passed the balance check.");
              finishMsg(msg);
            });
          }
          var meta = ["ProPDF conversion report", "Source: " + file.name,
                      "Geometry: " + (winner ? winner.tag : "n/a"), "Pages: " + n];
          if (meanConf != null) meta.push("Mean OCR confidence: " + meanConf + "%");
          prog.set(97, "Building styled workbook…");
          return buildStyledWorkbook(genericSheets(winner ? winner.pages : [], oneSheet, meta))
            .then(function (blob) {
              saveBlob(base + ".xlsx", blob);
              var cells = 0;
              (winner ? winner.combined : []).forEach(function (r2) { r2.forEach(function (c2) { if (c2) cells++; }); });
              finishMsg(cells ? "Extracted " + cells + " cells from " + n + " page(s) into a formatted table." :
                "No table content could be read. If this is a scanned PDF, set Mode = Force OCR and pick the right language.");
            });
        }
        return collect();
      }).catch(function (e) {
        prog.hide(); go.disabled = false;
        res.err(e && e.message ? e.message : String(e));
      });
    };
  }
})(typeof window !== "undefined" ? window : globalThis);
