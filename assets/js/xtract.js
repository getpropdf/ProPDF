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

  /* ---- statement semantics (v13: nearest-anchor transaction grouping) ---- */

  var HDR = {
    date: [/^(txn|tran(saction)?|post(ing)?)?\s*\.?\s*date$/, /^date$/, /tran\s*date/],
    value_date: [/value\s*date/, /^val\.?\s*dt\.?$/],
    particulars: [/particulars?/, /narration/, /description/, /details/, /transaction\s*(details|remarks)/, /remarks/],
    ref: [/(cheque|chq|cheq)\.?\s*(no|num|#)?/, /ref(erence)?\.?\s*(no|num|#)?/, /utr/, /instrument/],
    debit: [/withdrawal(\s*\(?dr\.?\)?)?(\s*(amt|amount))?/, /debits?(\s*amount)?/, /^dr\.?$/, /paid\s*out/, /withdrawals?/],
    credit: [/deposits?(\s*\(?cr\.?\)?)?(\s*(amt|amount))?/, /credits?(\s*amount)?/, /^cr\.?$/, /paid\s*in/],
    balance: [/(closing\s*|running\s*)?balance/, /^bal\.?$/]
  };
  var SKIP_RE = /closing\s*balance|balance\s*c\/?f|carried\s*forward|^total\b|grand\s*total|statement\s*summary|page\s*\d+\s*(of|\/)|computer\s*generated|transaction\s*total|legends?\b|end\s*of\s*statement/i;
  var OPEN_RE = /opening\s*balance|balance\s*b\/?f|brought\s*forward/i;

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
    work.forEach(function (l, i) {
      if (groups[i]) return;
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

  /* judge candidates: y-aware lines first (statement), grids as fallback */
  function bestExtraction(wordsPages) {
    var mgs = [4, 7, 11], tfs = [0.08, 0.2];
    var bestStmt = null;
    mgs.forEach(function (mg) {
      tfs.forEach(function (tf) {
        try {
          var pagesLines = globalStreamLines(wordsPages, mg, tf);
          var flat = [];
          pagesLines.forEach(function (pg) { pg.forEach(function (l) { flat.push(l); }); });
          if (!flat.length) return;
          var st = reconstructLines(flat);
          var cand = { tag: "lines-" + mg + "-" + tf, stmt: st };
          if (!bestStmt) { bestStmt = cand; return; }
          var a = st, b = bestStmt.stmt;
          if (a.strict > b.strict || (a.strict === b.strict && (a.confidence > b.confidence ||
              (a.confidence === b.confidence && a.rows.length > b.rows.length)))) bestStmt = cand;
        } catch (e) {}
      });
    });
    // generic grid candidates (used when no statement found)
    var candidates = [];
    var perPage = wordsPages.map(function (words) {
      var best = null, bestScore = -1;
      mgs.forEach(function (mg) {
        tfs.forEach(function (tf) {
          var rows = clusterRows(words);
          var g = cleanGrid(applyBounds(rows, findBounds(rows, mg, tf), mg), false);
          var s = scoreGrid(g);
          if (s > bestScore) { bestScore = s; best = g; }
        });
      });
      return best || [];
    });
    candidates.push({ tag: "per-page", pages: perPage });
    mgs.forEach(function (mg) {
      tfs.forEach(function (tf) {
        candidates.push({ tag: "global-" + mg + "-" + tf, pages: globalGrids(wordsPages, mg, tf) });
      });
    });
    var winner = null;
    candidates.forEach(function (c) {
      var comb = [], width = 0;
      c.pages.forEach(function (g) { g.forEach(function (r) { if (r.length > width) width = r.length; }); });
      c.pages.forEach(function (g) {
        g.forEach(function (r) { var rr = r.slice(); while (rr.length < width) rr.push(""); comb.push(rr); });
      });
      c.combined = comb;
      c.score = scoreGrid(comb);
      if (!winner || c.score > winner.score) winner = c;
    });
    if (winner) {
      winner.pages = winner.pages.map(function (g) { return stackWrappedHeaders(splitLeadingDateColumns(g)); });
      var comb2 = [];
      winner.pages.forEach(function (g) { g.forEach(function (r) { comb2.push(r); }); });
      winner.combined = comb2;
      winner.stmt = bestStmt ? bestStmt.stmt : null;
      if (bestStmt) winner.tag = bestStmt.tag;
    }
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
    info.innerHTML = "🧠 <strong>Smart converter:</strong> whole-document column detection → one row per transaction " +
      "(multi-line narrations merged) → <strong>balance-continuity validation</strong> on every row → clean bordered table " +
      "with a Validation sheet. 100% in your browser — no uploads.";
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
        var n = pdf.numPages, wordsPages = [], i = 1;
        function collect() {
          if (i > n) return done();
          prog.set(((i - 1) / n) * 90, "Reading page " + i + " of " + n + "…");
          return pdf.getPage(i).then(function (page) {
            return pageWords(page).then(function (words) {
              if (!force && words.length >= 5) {
                wordsPages.push(words); i++; return collect();
              }
              prog.set(((i - 1) / n) * 90, "OCR page " + i + " of " + n + "…");
              return ocrWords(page, langs, function (pr) {
                prog.set(((i - 1 + pr) / n) * 90, "OCR page " + i + " of " + n + " — " + Math.round(pr * 100) + "%");
              }).then(function (o) {
                usedOcr++;
                if (o.conf) ocrConfs.push(o.conf);
                wordsPages.push(o.words); i++; return collect();
              });
            });
          });
        }
        function done() {
          prog.set(93, "Reconstructing table…");
          var winner = bestExtraction(wordsPages);
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
