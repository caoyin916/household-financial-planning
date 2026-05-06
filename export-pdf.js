(function () {
  "use strict";

  const PRINT_CLASS = "full-pdf-export";
  /** Tab 面板 DOM id，自上而下顺序决定导出 PDF 中的先后与分页 */
  const PANEL_ORDER = ["panel-cashflow", "panel-networth", "panel-projection"];

  function getPanels() {
    return [...document.querySelectorAll(".app-tab-panel")];
  }

  function getSelectedPanelIds() {
    const ids = [];
    PANEL_ORDER.forEach(function (id) {
      const cb = document.querySelector('input[name="pdf-mod"][value="' + id + '"]');
      if (cb && cb.checked) ids.push(id);
    });
    return ids;
  }

  function setAllChecks(checked) {
    document.querySelectorAll('input[name="pdf-mod"]').forEach(function (cb) {
      cb.checked = checked;
    });
  }

  /**
   * @param {string[]} selectedIds panel ids to include (subset of PANEL_ORDER)
   */
  function exportPdfSelection(selectedIds) {
    if (!selectedIds.length) {
      window.alert("请至少选择一项要导出的内容。");
      return;
    }

    const triggerBtn = document.getElementById("btn-export-pdf");
    if (triggerBtn) triggerBtn.disabled = true;

    const panels = getPanels();
    const snapshot = panels.map(function (p) {
      return { el: p, hidden: p.hidden };
    });

    panels.forEach(function (p) {
      p.hidden = selectedIds.indexOf(p.id) === -1;
      p.classList.remove("pdf-export-break-before", "pdf-export-first");
    });

    let firstIncluded = true;
    PANEL_ORDER.forEach(function (id) {
      if (selectedIds.indexOf(id) === -1) return;
      const el = document.getElementById(id);
      if (!el) return;
      if (firstIncluded) {
        el.classList.add("pdf-export-first");
        firstIncluded = false;
      } else {
        el.classList.add("pdf-export-break-before");
      }
    });

    document.body.classList.add(PRINT_CLASS);

    let cleaned = false;
    let fallbackTimer = null;
    const mql = window.matchMedia("print");

    function detachMql() {
      try {
        if (typeof mql.removeEventListener === "function") {
          mql.removeEventListener("change", onPrintMediaChange);
        } else if (typeof mql.removeListener === "function") {
          mql.removeListener(onPrintMediaChange);
        }
      } catch (_) {}
    }

    function onPrintMediaChange(ev) {
      if (!ev.matches) cleanup();
    }

    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      detachMql();
      panels.forEach(function (p) {
        p.classList.remove("pdf-export-break-before", "pdf-export-first");
      });
      snapshot.forEach(function (_ref) {
        var el = _ref.el,
          hidden = _ref.hidden;
        el.hidden = hidden;
      });
      document.body.classList.remove(PRINT_CLASS);
      if (triggerBtn) triggerBtn.disabled = false;
    }

    window.addEventListener("afterprint", cleanup, { once: true });

    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onPrintMediaChange);
    } else if (typeof mql.addListener === "function") {
      mql.addListener(onPrintMediaChange);
    }

    fallbackTimer = window.setTimeout(function () {
      fallbackTimer = null;
      cleanup();
    }, 120000);

    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        try {
          window.print();
        } catch (e) {
          cleanup();
          console.warn("window.print failed", e);
        }
      });
    });
  }

  function init() {
    const pdfBtn = document.getElementById("btn-export-pdf");
    const dialog = document.getElementById("pdf-export-dialog");
    const btnCancel = document.getElementById("pdf-export-cancel");
    const btnConfirm = document.getElementById("pdf-export-confirm");
    const btnAll = document.getElementById("pdf-export-select-all");
    const btnNone = document.getElementById("pdf-export-select-none");

    if (!pdfBtn || !dialog || typeof dialog.showModal !== "function") {
      return;
    }

    pdfBtn.addEventListener("click", function () {
      dialog.showModal();
    });

    if (btnCancel) {
      btnCancel.addEventListener("click", function () {
        dialog.close();
      });
    }

    if (btnConfirm) {
      btnConfirm.addEventListener("click", function () {
        const ids = getSelectedPanelIds();
        if (!ids.length) {
          window.alert("请至少选择一项要导出的内容。");
          return;
        }
        dialog.close();
        exportPdfSelection(ids);
      });
    }

    if (btnAll) btnAll.addEventListener("click", function () {
      setAllChecks(true);
    });
    if (btnNone) btnNone.addEventListener("click", function () {
      setAllChecks(false);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
