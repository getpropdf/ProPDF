/* ============================================================
   ProPDF — on-demand library loader
   Loads each library from the local /lib folder first (offline),
   then falls back to cdnjs. Heavy libraries (OCR, Excel) load only
   when the relevant tool is opened, keeping startup lean.
   ============================================================ */
(function () {
  "use strict";

  // version-pinned sources. local path is tried first.
  var LIBS = {
    pdfLib: {
      global: "PDFLib",
      local: "lib/pdf-lib.min.js",
      cdn: "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js"
    },
    pdfjs: {
      global: "pdfjsLib",
      local: "lib/pdf.min.js",
      cdn: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
      worker_local: "lib/pdf.worker.min.js",
      worker_cdn: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
    },
    jszip: {
      global: "JSZip",
      local: "lib/jszip.min.js",
      cdn: "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"
    },
    xlsx: {
      global: "XLSX",
      local: "lib/xlsx.full.min.js",
      cdn: "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
    },
    tesseract: {
      global: "Tesseract",
      local: "lib/tesseract.min.js",
      cdn: "https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.0/tesseract.min.js"
    }
  };

  var loaded = {};   // key -> Promise

  function injectScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = function () { resolve(src); };
      s.onerror = function () { reject(new Error("failed: " + src)); };
      document.head.appendChild(s);
    });
  }

  // try local, then cdn; resolve once `global` exists on window
  function loadOne(key) {
    if (loaded[key]) return loaded[key];
    var cfg = LIBS[key];
    if (!cfg) return Promise.reject(new Error("unknown lib " + key));

    loaded[key] = injectScript(cfg.local)
      .then(check(cfg.global))
      .then(function () { cfg._from = "local"; })
      .catch(function () {
        return injectScript(cfg.cdn).then(check(cfg.global)).then(function () { cfg._from = "cdn"; });
      })
      .then(function () { return window[cfg.global]; });

    return loaded[key];
  }

  function check(globalName) {
    return function () {
      if (!window[globalName]) throw new Error("global " + globalName + " missing");
      return true;
    };
  }

  // public: ensure a set of libs are present
  function ensure() {
    var keys = Array.prototype.slice.call(arguments);
    return Promise.all(keys.map(loadOne)).then(function () {
      // configure pdf.js worker if it was requested
      if (keys.indexOf("pdfjs") !== -1 && window.pdfjsLib) {
        var cfg = LIBS.pdfjs;
        // use the worker from the SAME source the main library loaded from
        // (avoids fetch(), which is blocked on the file:// protocol)
        var src = (cfg._from === "cdn") ? cfg.worker_cdn : cfg.worker_local;
        try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = src; } catch (e) { /* ignore */ }
      }
    });
  }

  window.ProPDFLibs = { ensure: ensure };
})();
