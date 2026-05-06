(function () {
  "use strict";

  const TAB_PANEL = {
    cashflow: "panel-cashflow",
    networth: "panel-networth",
    projection: "panel-projection",
  };

  const TAB_HASH = {
    cashflow: "",
    networth: "networth",
    projection: "projection",
  };

  const HASH_TO_TAB = {
    "": "cashflow",
    networth: "networth",
    projection: "projection",
    retirement: "projection",
  };

  function showTab(name) {
    if (!TAB_PANEL[name]) return;
    const panelId = TAB_PANEL[name];

    document.querySelectorAll(".app-tab").forEach((btn) => {
      const on = btn.getAttribute("data-tab") === name;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });

    document.querySelectorAll(".app-tab-panel").forEach((p) => {
      const on = p.id === panelId;
      p.hidden = !on;
      p.classList.toggle("is-active", on);
    });

    const h = TAB_HASH[name];
    const base = location.pathname + location.search;
    try {
      if (h) {
        history.replaceState(null, "", base + "#" + h);
      } else {
        history.replaceState(null, "", base);
      }
    } catch (_) {}
  }

  function tabFromHash() {
    const raw = (location.hash || "").replace(/^#/, "").toLowerCase();
    if (Object.prototype.hasOwnProperty.call(HASH_TO_TAB, raw)) {
      return HASH_TO_TAB[raw];
    }
    return "cashflow";
  }

  function init() {
    const bar = document.querySelector(".app-tabs");
    if (!bar) return;

    bar.addEventListener("click", (e) => {
      const btn = e.target && e.target.closest ? e.target.closest("[data-tab]") : null;
      if (!btn || !bar.contains(btn)) return;
      const name = btn.getAttribute("data-tab");
      if (name) showTab(name);
    });

    showTab(tabFromHash());
    window.addEventListener("hashchange", () => showTab(tabFromHash()));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
