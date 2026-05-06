(function () {
  "use strict";

  const STORAGE_KEY = "retirement-simulator-v1";
  const RS_SCENARIOS_KEY = "retirement-simulator-scenarios-v1";
  const NW_KEY = "household-net-worth-v2";
  const PROJECTION_YEARS = 50;

  const DEFAULTS = {
    husbandDob: "1986-09-16",
    wifeDob: "1989-03-02",
    retireAgeHusband: 50,
    rentalYear1: 90000,
    rentalGrowthPct: 1,
    tuitionAnnual: 80000,
    tuitionYears: 4,
    intlSchoolAnnual: 40000,
    intlSchoolStartAge: 3,
    livingExpenseYear1: 40000,
    inflationPct: 3,
    age401k: 59.5,
    annual401kReturnPct: 8,
    withdrawRatePct: 4,
    rmdStartAge: 73,
    ageSS: 67,
    ssMonthlyEach: 2000,
    current401kTotal: "",
    currentBrokerageTotal: "",
    annual401kContributionPreRetire: 68000,
    brokerageGrowthPct: 5,
    taxRatePct: 0,
    brokerageCapitalGainTaxPct: 15,
    standardDeduction: 29200,
    ssTaxableRatio: 0.85,
  };

  const BASIC_STATIC_ORDER = ["husbandDob", "wifeDob", "retireAgeHusband"];
  const BASIC_STATIC_SET = new Set(BASIC_STATIC_ORDER);

  const INCOME_ORDER = [
    "rentalYear1",
    "rentalGrowthPct",
    "current401kTotal",
    "currentBrokerageTotal",
    "brokerageGrowthPct",
    "annual401kReturnPct",
    "annual401kContributionPreRetire",
    "age401k",
    "withdrawRatePct",
    "rmdStartAge",
    "ageSS",
    "ssMonthlyEach",
    "ssTaxableRatio",
  ];
  const INCOME_SET = new Set(INCOME_ORDER);

  const COST_ORDER = [
    "livingExpenseYear1",
    "inflationPct",
    "tuitionAnnual",
    "tuitionYears",
    "intlSchoolAnnual",
    "intlSchoolStartAge",
    "taxRatePct",
    "brokerageCapitalGainTaxPct",
    "standardDeduction",
  ];
  const COST_SET = new Set(COST_ORDER);

  const DEFAULT_ASSUMPTION_ORDER = BASIC_STATIC_ORDER.concat(INCOME_ORDER).concat(COST_ORDER);

  const DEFAULT_ASSUMPTION_LABELS = {
    husbandDob: "丈夫出生日期",
    wifeDob: "妻子出生日期",
    retireAgeHusband: "丈夫退休年龄（一起退休，决定预测起点年）",
    rentalYear1: "退休首年投资房净收入（税后，美元）",
    rentalGrowthPct: "投资房净收入年增幅（%）",
    livingExpenseYear1: "退休后家庭生活开销首年（美元/年）",
    inflationPct: "通胀率（生活开销年增长，%）",
    tuitionAnnual: "子女大学学杂费（美元/年，每位）",
    tuitionYears: "每位子女就读年数",
    intlSchoolAnnual: "国际学校费用（美元/年，每位子女，至上大学前）",
    intlSchoolStartAge: "国际学校计费起始年龄（满该岁当年起至上大学前一年）",
    current401kTotal: "当前家庭总 401(k)（可从净资产同步）",
    currentBrokerageTotal: "当前家庭 Brokerage 余额（可从净资产同步）",
    brokerageGrowthPct: "Brokerage 年增长率（%）",
    annual401kReturnPct: "401(k) 年化回报率（%）",
    annual401kContributionPreRetire: "退休前每年存入 401(k)（含自缴与雇主 match，美元/年；至退休首年止）",
    age401k: "401(k) 可开始领取年龄",
    withdrawRatePct: "401(k) 年提取比例（%）",
    rmdStartAge: "RMD 起始年龄",
    ageSS: "社安金开始年龄（展示用满龄年取整）",
    ssMonthlyEach: "每人社安金（美元/月，至龄后）",
    ssTaxableRatio: "Social Security 应税比例（默认 85%）",
    standardDeduction: "Federal standard deduction（MFJ，美元/年）",
    taxRatePct: "额外州税率（可选，%）",
    brokerageCapitalGainTaxPct:
      "长期资本利得有效税率 r（%）：假设卖出毛额 B 全部视为长期资本利得、不另扣 cost basis，税 = B×r，递延至次年；默认 15%",
  };

  const DEFAULT_TABLE_HEADER_LABELS = {
    year: "年",
    ageH: "夫龄",
    k401Total: "401K Total",
    k401Balance: "401K总额",
    brokerageStart: "brokerage账户起始金额",
    brokerageWithdrawal: "Brokerage 补缺提款（税后净额，≈收支缺口）",
    brokerageCGTax: "资本利得税（Brokerage，上年卖出本年缴纳）",
    brokerageBalance: "brokerage账户余额",
    rental: "投资房",
    ssTotal: "社安",
    tax: "Tax",
    intlSchool: "国际学校",
    tuition: "大学支出",
    living: "生活支出",
    income: "总收入",
    expense: "总支出",
  };

  const DEFAULT_TABLE_COLUMN_ORDER = [
    "year",
    "ageH",
    "k401Total",
    "k401Balance",
    "brokerageStart",
    "brokerageWithdrawal",
    "brokerageCGTax",
    "brokerageBalance",
    "rental",
    "ssTotal",
    "tax",
    "intlSchool",
    "tuition",
    "living",
    "income",
    "expense",
  ];

  const RMD_DIVISOR = {
    73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1,
    80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2,
    87: 14.4, 88: 13.7, 89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1,
    94: 9.5, 95: 8.9, 96: 8.4, 97: 7.8, 98: 7.3, 99: 6.8, 100: 6.4,
    101: 6.0, 102: 5.6, 103: 5.2, 104: 4.9, 105: 4.6, 106: 4.3, 107: 4.1,
    108: 3.9, 109: 3.7, 110: 3.5, 111: 3.4, 112: 3.3, 113: 3.1, 114: 3.0,
    115: 2.9, 116: 2.8, 117: 2.7, 118: 2.5, 119: 2.3, 120: 2.0,
  };

  // 2024 Federal brackets for Married Filing Jointly (taxable ordinary income)
  const FEDERAL_BRACKETS_MFJ = [
    { cap: 23200, rate: 0.10 },
    { cap: 94300, rate: 0.12 },
    { cap: 201050, rate: 0.22 },
    { cap: 383900, rate: 0.24 },
    { cap: 487450, rate: 0.32 },
    { cap: 731200, rate: 0.35 },
    { cap: Infinity, rate: 0.37 },
  ];

  let nwSnapshot = { ok: false, people: [], husband: 0, wife: 0, total: 0, brokerageTotal: 0 };

  function $(id) {
    return document.getElementById(id);
  }

  function parseMoney(raw) {
    if (raw == null || raw === "") return NaN;
    const v = parseFloat(String(raw).replace(/[$,\s]/g, ""));
    return Number.isFinite(v) ? v : NaN;
  }

  function formatMoney(n) {
    return Math.round(n).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }

  function formatCurrency(n) {
    return `$${formatMoney(Math.abs(n))}`;
  }

  function formatCurrencySigned(n) {
    return `${n >= 0 ? "" : "−"}$${formatMoney(Math.abs(n))}`;
  }

  function parseISODate(s) {
    if (!s || typeof s !== "string") return null;
    const p = s.trim().split("-");
    if (p.length < 3) return null;
    const y = parseInt(p[0], 10);
    const m = parseInt(p[1], 10) - 1;
    const d = parseInt(p[2], 10);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    return new Date(y, m, d);
  }

  function stripCurrencyText(s) {
    return String(s == null ? "" : s).replace(/[$,\s]/g, "");
  }

  function formatInputCurrency(raw) {
    const clean = stripCurrencyText(raw);
    if (clean === "") return "";
    const v = parseFloat(clean);
    if (!Number.isFinite(v)) return "";
    return formatCurrency(v);
  }

  function bindMoneyInput(inp, onAfterFormat) {
    if (!inp) return;
    inp.addEventListener("focus", () => {
      inp.value = stripCurrencyText(inp.value);
    });
    inp.addEventListener("blur", () => {
      inp.value = formatInputCurrency(inp.value);
      if (onAfterFormat) onAfterFormat();
    });
  }

  function ageYearsAt(dob, ref) {
    if (!(dob instanceof Date) || !(ref instanceof Date)) return -Infinity;
    return (ref - dob) / (365.25 * 24 * 3600 * 1000);
  }

  function ageOnDec31(year, dob) {
    const ref = new Date(year, 11, 31);
    let a = ref.getFullYear() - dob.getFullYear();
    const bday = new Date(year, dob.getMonth(), dob.getDate());
    if (ref < bday) a--;
    return a;
  }

  function collegeTuitionCalendarYears(dob, yearsCount) {
    if (!(dob instanceof Date)) return [];
    const turn18Year = dob.getFullYear() + 18;
    const firstTuitionYear = dob.getMonth() >= 8 ? turn18Year + 1 : turn18Year;
    const out = [];
    for (let i = 0; i < yearsCount; i++) out.push(firstTuitionYear + i);
    return out;
  }

  function firstIntlSchoolFeeYear(dob, startAge) {
    if (!(dob instanceof Date) || !Number.isFinite(startAge)) return null;
    const maxY = dob.getFullYear() + 40;
    for (let y = dob.getFullYear(); y <= maxY; y++) {
      if (ageOnDec31(y, dob) >= startAge) return y;
    }
    return null;
  }

  function lastIntlSchoolYearBeforeCollege(dob, tuitionYearsCount) {
    const cy = collegeTuitionCalendarYears(dob, tuitionYearsCount);
    return cy.length ? cy[0] - 1 : null;
  }

  function intlSchoolFeeForChildInYear(year, dob, tuitionYearsCount, annualFee, startAge) {
    if (!(dob instanceof Date) || !Number.isFinite(annualFee) || annualFee <= 0) return 0;
    const firstY = firstIntlSchoolFeeYear(dob, startAge);
    const lastY = lastIntlSchoolYearBeforeCollege(dob, tuitionYearsCount);
    if (firstY == null || lastY == null || firstY > lastY) return 0;
    return year >= firstY && year <= lastY ? annualFee : 0;
  }

  function retirementStartDate(husbandDob, retireAge) {
    return new Date(
      husbandDob.getFullYear() + retireAge,
      husbandDob.getMonth(),
      husbandDob.getDate()
    );
  }

  function retirementFirstCalendarYear(husbandDob, retireAge) {
    return husbandDob.getFullYear() + retireAge;
  }

  function cssEscAttr(s) {
    const str = String(s);
    return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(str) : str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function assumptionSectionForKey(k) {
    if (BASIC_STATIC_SET.has(k)) return "basicStatic";
    if (k.indexOf("childDob:") === 0) return "children";
    if (INCOME_SET.has(k)) return "income";
    if (COST_SET.has(k)) return "cost";
    return "basicStatic";
  }

  function getAllValidAssumptionKeysFromDom() {
    const out = new Set();
    document.querySelectorAll("#rs-form .rs-assumption-item[data-rs-key]").forEach((el) => {
      const k = el.getAttribute("data-rs-key");
      if (k) out.add(k);
    });
    return out;
  }

  function fillKeyBucket(preferred, valid, defaultOrder) {
    const seen = new Set();
    const out = [];
    preferred.forEach((k) => {
      if (valid.has(k) && !seen.has(k)) {
        out.push(k);
        seen.add(k);
      }
    });
    defaultOrder.forEach((k) => {
      if (valid.has(k) && !seen.has(k)) out.push(k);
    });
    return out;
  }

  function normalizeAssumptionOrder(order) {
    const valid = getAllValidAssumptionKeysFromDom();
    const basicStaticDef = BASIC_STATIC_ORDER.filter((k) => valid.has(k));
    const childDef = [...valid]
      .filter((k) => k.indexOf("childDob:") === 0)
      .sort();
    const incomeDef = INCOME_ORDER.filter((k) => valid.has(k));
    const costDef = COST_ORDER.filter((k) => valid.has(k));
    const defaultFull = basicStaticDef.concat(childDef, incomeDef, costDef);
    if (!Array.isArray(order) || order.length === 0) return defaultFull;

    const bs = [];
    const ch = [];
    const inc = [];
    const co = [];
    order.forEach((k) => {
      if (!valid.has(k)) return;
      if (BASIC_STATIC_SET.has(k)) bs.push(k);
      else if (k.indexOf("childDob:") === 0) ch.push(k);
      else if (INCOME_SET.has(k)) inc.push(k);
      else if (COST_SET.has(k)) co.push(k);
    });
    return fillKeyBucket(bs, valid, basicStaticDef)
      .concat(fillKeyBucket(ch, valid, childDef))
      .concat(fillKeyBucket(inc, valid, incomeDef))
      .concat(fillKeyBucket(co, valid, costDef));
  }

  function collectAssumptionOrderFromDom() {
    const out = [];
    const gather = (id) => {
      const list = $(id);
      if (!list) return;
      list.querySelectorAll(".rs-assumption-item[data-rs-key]").forEach((el) => {
        const k = el.getAttribute("data-rs-key");
        if (k) out.push(k);
      });
    };
    gather("rs-assumption-basic-static");
    gather("rs-children-list");
    gather("rs-assumption-income");
    gather("rs-assumption-cost");
    return out.length ? out : DEFAULT_ASSUMPTION_ORDER.slice();
  }

  function collectAssumptionLabels() {
    const out = {};
    document.querySelectorAll(".rs-field-label-input[data-rs-label-key]").forEach((inp) => {
      const k = inp.getAttribute("data-rs-label-key");
      if (!k) return;
      const raw = String(inp.value || "").trim();
      out[k] = raw || DEFAULT_ASSUMPTION_LABELS[k] || "";
    });
    return out;
  }

  function applyAssumptionLabels(labels) {
    const merged = Object.assign({}, DEFAULT_ASSUMPTION_LABELS, labels || {});
    document.querySelectorAll(".rs-field-label-input[data-rs-label-key]").forEach((inp) => {
      const k = inp.getAttribute("data-rs-label-key");
      if (!k) return;
      let v = Object.prototype.hasOwnProperty.call(merged, k) ? merged[k] : "";
      if ((v == null || v === "") && k.indexOf("childDob:") === 0) v = "子女 · 出生日期";
      if (v != null && v !== "") inp.value = v;
    });
  }

  function newChildId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return `ch-${crypto.randomUUID().slice(0, 10)}`;
    return `ch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeChildrenFromSaved(saved) {
    if (saved && Array.isArray(saved.children) && saved.children.length) {
      return saved.children.map((c, i) => ({
        id: c && c.id != null && String(c.id) !== "" ? String(c.id) : `ch-${i}`,
        dob: c && c.dob != null ? String(c.dob) : "",
      }));
    }
    const legacy = [];
    if (saved && saved.child1Dob) legacy.push({ id: "ch-0", dob: String(saved.child1Dob) });
    if (saved && saved.child2Dob) legacy.push({ id: "ch-1", dob: String(saved.child2Dob) });
    if (legacy.length) return legacy;
    return [
      { id: "ch-a", dob: "2023-10-30" },
      { id: "ch-b", dob: "2026-01-14" },
    ];
  }

  function createChildRow(child) {
    const id = child.id;
    const key = `childDob:${id}`;
    const row = document.createElement("div");
    row.className = "rs-assumption-item";
    row.setAttribute("data-rs-key", key);
    row.setAttribute("data-child-id", id);
    row.draggable = true;

    const drag = document.createElement("span");
    drag.className = "rs-assumption-drag";
    drag.title = "拖动排序";
    drag.setAttribute("aria-label", "拖动排序");
    drag.setAttribute("role", "presentation");
    drag.textContent = "⋮⋮";

    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "btn btn-ghost btn-sm rs-child-remove";
    rm.setAttribute("aria-label", "删除该子女");
    rm.textContent = "✕";

    const label = document.createElement("label");
    label.className = "rs-field";

    const labelInp = document.createElement("input");
    labelInp.type = "text";
    labelInp.className = "rs-field-label-input";
    labelInp.setAttribute("data-rs-label-key", key);
    labelInp.value = "子女 · 出生日期";
    labelInp.spellcheck = false;

    const dobInp = document.createElement("input");
    dobInp.type = "date";
    dobInp.className = "rs-child-dob";
    dobInp.setAttribute("data-child-id", id);
    if (child.dob) dobInp.value = child.dob;

    label.appendChild(labelInp);
    label.appendChild(dobInp);
    row.appendChild(drag);
    row.appendChild(rm);
    row.appendChild(label);
    return row;
  }

  function renderChildrenFromState(children) {
    const list = $("rs-children-list");
    if (!list) return;
    list.innerHTML = "";
    (children || []).forEach((c) => {
      list.appendChild(createChildRow(c));
    });
  }

  function collectChildrenFromDom() {
    const list = $("rs-children-list");
    if (!list) return [];
    const out = [];
    list.querySelectorAll(".rs-assumption-item[data-child-id]").forEach((row) => {
      const id = row.getAttribute("data-child-id");
      const inp = row.querySelector(".rs-child-dob");
      out.push({ id: id || newChildId(), dob: inp ? inp.value : "" });
    });
    return out;
  }

  function initChildrenUi() {
    const addBtn = $("rs-btn-add-child");
    if (addBtn) {
      addBtn.addEventListener("click", () => {
        const list = $("rs-children-list");
        if (!list) return;
        list.appendChild(createChildRow({ id: newChildId(), dob: "" }));
        persistState();
        render();
      });
    }
    const chList = $("rs-children-list");
    if (chList) {
      chList.addEventListener("click", (e) => {
        const t = e.target;
        if (t && t.classList && t.classList.contains("rs-child-remove")) {
          e.preventDefault();
          const item = t.closest && t.closest(".rs-assumption-item");
          if (item) item.remove();
          persistState();
          render();
        }
      });
    }
  }

  function applyAssumptionOrder(order) {
    const full = normalizeAssumptionOrder(order);
    const bs = [];
    const ch = [];
    const inc = [];
    const co = [];
    full.forEach((k) => {
      const sec = assumptionSectionForKey(k);
      if (sec === "basicStatic") bs.push(k);
      else if (sec === "children") ch.push(k);
      else if (sec === "income") inc.push(k);
      else if (sec === "cost") co.push(k);
    });
    const append = (listId, keys) => {
      const listEl = $(listId);
      if (!listEl) return;
      keys.forEach((k) => {
        const el = document.querySelector(`#rs-form .rs-assumption-item[data-rs-key="${cssEscAttr(k)}"]`);
        if (el) listEl.appendChild(el);
      });
    };
    append("rs-assumption-basic-static", bs);
    append("rs-children-list", ch);
    append("rs-assumption-income", inc);
    append("rs-assumption-cost", co);
  }

  function collectTableHeaderLabels() {
    const out = {};
    document.querySelectorAll(".rs-col-label-input[data-rs-col-key]").forEach((inp) => {
      const k = inp.getAttribute("data-rs-col-key");
      if (!k) return;
      const raw = String(inp.value || "").trim();
      out[k] = raw || DEFAULT_TABLE_HEADER_LABELS[k] || "";
    });
    return out;
  }

  function applyTableHeaderLabels(labels) {
    const merged = Object.assign({}, DEFAULT_TABLE_HEADER_LABELS, labels || {});
    document.querySelectorAll(".rs-col-label-input[data-rs-col-key]").forEach((inp) => {
      const k = inp.getAttribute("data-rs-col-key");
      if (k && Object.prototype.hasOwnProperty.call(merged, k)) inp.value = merged[k];
    });
  }

  function normalizeTableColumnOrder(order) {
    const base = DEFAULT_TABLE_COLUMN_ORDER.slice();
    if (!Array.isArray(order)) return base;
    const seen = new Set();
    const out = [];
    order.forEach((k) => {
      if (base.indexOf(k) >= 0 && !seen.has(k)) {
        out.push(k);
        seen.add(k);
      }
    });
    base.forEach((k) => {
      if (!seen.has(k)) out.push(k);
    });
    return out;
  }

  function collectTableColumnOrderFromDom() {
    const row = $("rs-header-row");
    if (!row) return DEFAULT_TABLE_COLUMN_ORDER.slice();
    return Array.from(row.querySelectorAll("th[data-rs-col-key]"))
      .map((th) => th.getAttribute("data-rs-col-key") || "")
      .filter(Boolean);
  }

  function applyTableColumnOrder(order) {
    const row = $("rs-header-row");
    if (!row) return;
    normalizeTableColumnOrder(order).forEach((key) => {
      const th = row.querySelector(`th[data-rs-col-key="${key}"]`);
      if (th) row.appendChild(th);
    });
  }

  function placeAssumptionItemAtPoint(list, dragging, x, y) {
    const stack = document.elementsFromPoint(x, y);
    const target = stack.find(
      (el) => el.classList && el.classList.contains("rs-assumption-item") && el !== dragging && list.contains(el)
    );
    if (!target) {
      list.appendChild(dragging);
      return;
    }
    const r = target.getBoundingClientRect();
    const before = x < r.left + r.width / 2;
    if (before) list.insertBefore(dragging, target);
    else if (target.nextSibling) list.insertBefore(dragging, target.nextSibling);
    else list.appendChild(dragging);
  }

  function bindAssumptionDragList(list) {
    if (!list) return;
    let dragAllowedFromHandle = false;

    list.addEventListener("mousedown", (e) => {
      dragAllowedFromHandle = !!(e.target.closest && e.target.closest(".rs-assumption-drag"));
    });
    list.addEventListener("mouseup", () => {
      dragAllowedFromHandle = false;
    });

    list.addEventListener("dragstart", (e) => {
      const item = e.target && e.target.closest && e.target.closest(".rs-assumption-item");
      if (!item || !list.contains(item)) return;
      if (!dragAllowedFromHandle) {
        e.preventDefault();
        return;
      }
      item.classList.add("rs-dragging");
      e.dataTransfer.effectAllowed = "move";
    });

    list.addEventListener("dragend", (e) => {
      dragAllowedFromHandle = false;
      const item = e.target && e.target.closest && e.target.closest(".rs-assumption-item");
      if (item) item.classList.remove("rs-dragging");
      persistState();
      render();
    });

    list.addEventListener("dragover", (e) => {
      e.preventDefault();
      const dragging = list.querySelector(".rs-assumption-item.rs-dragging");
      if (!dragging) return;
      placeAssumptionItemAtPoint(list, dragging, e.clientX, e.clientY);
    });
  }

  function initAssumptionDrag() {
    bindAssumptionDragList($("rs-assumption-basic-static"));
    bindAssumptionDragList($("rs-children-list"));
    bindAssumptionDragList($("rs-assumption-income"));
    bindAssumptionDragList($("rs-assumption-cost"));
  }

  function initTableColumnDrag() {
    const row = $("rs-header-row");
    if (!row) return;
    let dragAllowedFromHandle = false;

    row.addEventListener("mousedown", (e) => {
      dragAllowedFromHandle = !!(e.target.closest && e.target.closest(".rs-col-drag"));
    });
    row.addEventListener("mouseup", () => {
      dragAllowedFromHandle = false;
    });

    row.addEventListener("dragstart", (e) => {
      const th = e.target && e.target.closest && e.target.closest("th[data-rs-col-key]");
      if (!th) return;
      if (!dragAllowedFromHandle) {
        e.preventDefault();
        return;
      }
      th.classList.add("rs-col-dragging");
      e.dataTransfer.effectAllowed = "move";
    });

    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      const dragging = row.querySelector("th.rs-col-dragging");
      if (!dragging) return;
      const target = e.target && e.target.closest && e.target.closest("th[data-rs-col-key]");
      if (!target || target === dragging) return;
      const r = target.getBoundingClientRect();
      const before = e.clientX < r.left + r.width / 2;
      if (before) row.insertBefore(dragging, target);
      else if (target.nextSibling) row.insertBefore(dragging, target.nextSibling);
      else row.appendChild(dragging);
    });

    row.addEventListener("dragend", () => {
      dragAllowedFromHandle = false;
      const dragging = row.querySelector("th.rs-col-dragging");
      if (dragging) dragging.classList.remove("rs-col-dragging");
      persistState();
      render();
    });
  }

  function rmdDivisorForAge(age) {
    if (!Number.isFinite(age)) return null;
    if (age < 73) return null;
    if (age >= 120) return 2.0;
    return RMD_DIVISOR[age] || null;
  }

  /** 单账户：达到领取年龄后的「基准」提取（比例 vs RMD 取高），与原先 computeSchedule 一致 */
  function scheduled401kWithdrawalForAccount(bal, ageFrac, ageDec31, st, withdrawRate) {
    if (ageFrac < st.age401k) return 0;
    let wd = bal * withdrawRate;
    if (ageDec31 >= st.rmdStartAge) {
      const div = rmdDivisorForAge(ageDec31);
      if (div) wd = Math.max(wd, bal / div);
    }
    return Math.min(wd, bal);
  }

  function calcProgressiveTax(taxableIncome, brackets) {
    let remaining = Math.max(0, taxableIncome);
    let lastCap = 0;
    let tax = 0;
    for (const b of brackets) {
      if (remaining <= 0) break;
      const span = Math.min(remaining, b.cap - lastCap);
      if (span > 0) {
        tax += span * b.rate;
        remaining -= span;
      }
      lastCap = b.cap;
    }
    return tax;
  }

  function load401kFromNetWorth() {
    const raw = localStorage.getItem(NW_KEY);
    if (!raw) return { ok: false, people: [], husband: 0, wife: 0, total: 0, brokerageTotal: 0 };
    let data;
    try {
      data = JSON.parse(raw);
    } catch (_) {
      return { ok: false, people: [], husband: 0, wife: 0, total: 0, brokerageTotal: 0 };
    }

    const people = Array.isArray(data.people) ? data.people : [];
    const totals = {};
    people.forEach((p) => {
      totals[p.id] = 0;
    });

    const assets = Array.isArray(data.assets) ? data.assets : [];
    let brokerageTotal = 0;
    assets.forEach((row) => {
      const lab = String(row.label || "").toLowerCase();
      const amounts = row.amounts || {};
      if (lab.includes("401") || lab.includes("403")) {
        people.forEach((p) => {
          const v = parseMoney(amounts[p.id]);
          if (Number.isFinite(v)) totals[p.id] += v;
        });
      }
      if (lab.includes("brokerage") || lab.includes("经纪")) {
        people.forEach((p) => {
          const v = parseMoney(amounts[p.id]);
          if (Number.isFinite(v)) brokerageTotal += v;
        });
      }
    });

    const ids = people.map((p) => p.id);
    const husband = ids.length > 0 ? totals[ids[0]] || 0 : 0;
    const wife = ids.length > 1 ? totals[ids[1]] || 0 : 0;
    return { ok: true, people, husband, wife, total: husband + wife, brokerageTotal };
  }

  function getFormState() {
    const g = (id) => {
      const el = $(id);
      return el ? el.value : "";
    };
    const gn = (id, def) => {
      const v = parseFloat(g(id));
      return Number.isFinite(v) ? v : def;
    };
    const gm = (id, def) => {
      const v = parseMoney(g(id));
      return Number.isFinite(v) ? v : def;
    };
    const gi = (id, def) => {
      const v = parseInt(g(id), 10);
      return Number.isFinite(v) ? v : def;
    };

    let age401k = parseFloat(g("rs-age-401k"));
    if (!Number.isFinite(age401k)) age401k = DEFAULTS.age401k;
    let ageSS = parseFloat(g("rs-age-ss"));
    if (!Number.isFinite(ageSS)) ageSS = DEFAULTS.ageSS;

    return {
      husbandDob: g("rs-h-dob") || DEFAULTS.husbandDob,
      wifeDob: g("rs-w-dob") || DEFAULTS.wifeDob,
      children: collectChildrenFromDom(),
      retireAgeHusband: gn("rs-retire-age", DEFAULTS.retireAgeHusband),
      rentalYear1: gm("rs-rental-y1", DEFAULTS.rentalYear1),
      rentalGrowthPct: gn("rs-rental-growth", DEFAULTS.rentalGrowthPct),
      livingExpenseYear1: gm("rs-living-y1", DEFAULTS.livingExpenseYear1),
      inflationPct: gn("rs-inflation", DEFAULTS.inflationPct),
      tuitionAnnual: gm("rs-tuition", DEFAULTS.tuitionAnnual),
      tuitionYears: Math.max(1, Math.min(8, gi("rs-tuition-years", DEFAULTS.tuitionYears))),
      intlSchoolAnnual: gm("rs-intl-annual", DEFAULTS.intlSchoolAnnual),
      intlSchoolStartAge: Math.max(1, Math.min(25, gi("rs-intl-start-age", DEFAULTS.intlSchoolStartAge))),
      current401kTotal: gm("rs-401k-total", 0),
      currentBrokerageTotal: gm("rs-brokerage-total", 0),
      brokerageGrowthPct: gn("rs-brokerage-growth", DEFAULTS.brokerageGrowthPct),
      annual401kReturnPct: gn("rs-401k-return", DEFAULTS.annual401kReturnPct),
      annual401kContributionPreRetire: gm("rs-401k-pre-annual", DEFAULTS.annual401kContributionPreRetire),
      age401k,
      withdrawRatePct: gn("rs-401k-withdraw-rate", DEFAULTS.withdrawRatePct),
      rmdStartAge: Math.max(70, Math.min(80, gi("rs-rmd-start", DEFAULTS.rmdStartAge))),
      ageSS,
      ssMonthlyEach: gm("rs-ss-monthly", DEFAULTS.ssMonthlyEach),
      ssTaxableRatio: Math.max(0, Math.min(1, gn("rs-ss-taxable-ratio", DEFAULTS.ssTaxableRatio))),
      standardDeduction: gm("rs-std-deduction", DEFAULTS.standardDeduction),
      taxRatePct: gn("rs-tax-rate", DEFAULTS.taxRatePct),
      brokerageCapitalGainTaxPct: Math.max(
        0,
        Math.min(100, gn("rs-brokerage-cg-tax-pct", DEFAULTS.brokerageCapitalGainTaxPct))
      ),
    };
  }

  function setFormState(s) {
    const fields = [
      ["rs-h-dob", "husbandDob"],
      ["rs-w-dob", "wifeDob"],
      ["rs-retire-age", "retireAgeHusband"],
      ["rs-rental-y1", "rentalYear1"],
      ["rs-rental-growth", "rentalGrowthPct"],
      ["rs-living-y1", "livingExpenseYear1"],
      ["rs-inflation", "inflationPct"],
      ["rs-tuition", "tuitionAnnual"],
      ["rs-tuition-years", "tuitionYears"],
      ["rs-intl-annual", "intlSchoolAnnual"],
      ["rs-intl-start-age", "intlSchoolStartAge"],
      ["rs-401k-total", "current401kTotal"],
      ["rs-brokerage-total", "currentBrokerageTotal"],
      ["rs-brokerage-growth", "brokerageGrowthPct"],
      ["rs-401k-return", "annual401kReturnPct"],
      ["rs-401k-pre-annual", "annual401kContributionPreRetire"],
      ["rs-age-401k", "age401k"],
      ["rs-401k-withdraw-rate", "withdrawRatePct"],
      ["rs-rmd-start", "rmdStartAge"],
      ["rs-age-ss", "ageSS"],
      ["rs-ss-monthly", "ssMonthlyEach"],
      ["rs-ss-taxable-ratio", "ssTaxableRatio"],
      ["rs-std-deduction", "standardDeduction"],
      ["rs-tax-rate", "taxRatePct"],
      ["rs-brokerage-cg-tax-pct", "brokerageCapitalGainTaxPct"],
    ];
    fields.forEach(([id, key]) => {
      const el = $(id);
      if (!el) return;
      const v = s[key];
      if (v != null && v !== "") el.value = String(v);
    });
    const moneyIds = [
      "rs-rental-y1",
      "rs-ss-monthly",
      "rs-tuition",
      "rs-intl-annual",
      "rs-living-y1",
      "rs-401k-total",
      "rs-401k-pre-annual",
      "rs-brokerage-total",
      "rs-std-deduction",
    ];
    moneyIds.forEach((id) => {
      const el = $(id);
      if (el) el.value = formatInputCurrency(el.value);
    });
  }

  function buildPersistPayload() {
    const st = getFormState();
    st.assumptionLabels = collectAssumptionLabels();
    st.assumptionOrder = collectAssumptionOrderFromDom();
    st.tableHeaderLabels = collectTableHeaderLabels();
    st.tableColumnOrder = collectTableColumnOrderFromDom();
    return st;
  }

  function persistState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(buildPersistPayload()));
    } catch (_) {}
  }

  function loadRsScenariosStore() {
    try {
      const raw = localStorage.getItem(RS_SCENARIOS_KEY);
      if (raw) {
        const o = JSON.parse(raw);
        if (o && Array.isArray(o.scenarios)) return o;
      }
    } catch (_) {}
    return { scenarios: [] };
  }

  function saveRsScenariosStore(store) {
    try {
      localStorage.setItem(RS_SCENARIOS_KEY, JSON.stringify(store));
    } catch (_) {}
  }

  function newRsScenarioId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return `rs-${crypto.randomUUID()}`;
    }
    return `rs-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function refreshRsScenarioSelect() {
    const sel = $("rs-scenario-select");
    if (!sel) return;
    const prev = sel.value;
    const store = loadRsScenariosStore();
    sel.innerHTML = '<option value="">— 选择已保存方案 —</option>';
    store.scenarios.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.id;
      const dateStr =
        s.updatedAt && typeof s.updatedAt === "string"
          ? new Date(s.updatedAt).toLocaleString(undefined, {
              dateStyle: "short",
              timeStyle: "short",
            })
          : "";
      opt.textContent = dateStr ? `${s.name || "未命名"} · ${dateStr}` : s.name || "未命名";
      opt.title = s.name || "";
      sel.appendChild(opt);
    });
    if (prev && [...sel.options].some((o) => o.value === prev)) {
      sel.value = prev;
    }
  }

  function applyProjectionScenarioSnapshot(saved) {
    if (!saved || typeof saved !== "object") return;
    const merged = Object.assign({}, DEFAULTS);
    Object.keys(DEFAULTS).forEach((k) => {
      if (Object.prototype.hasOwnProperty.call(saved, k) && saved[k] != null && saved[k] !== "") {
        merged[k] = saved[k];
      }
    });
    merged.children = normalizeChildrenFromSaved(saved);
    setFormState(merged);
    renderChildrenFromState(merged.children);

    const labelsMerged = Object.assign(
      {},
      DEFAULT_ASSUMPTION_LABELS,
      saved.assumptionLabels && typeof saved.assumptionLabels === "object" ? saved.assumptionLabels : {}
    );
    applyAssumptionLabels(labelsMerged);
    applyAssumptionOrder(saved.assumptionOrder);
    applyTableHeaderLabels(saved.tableHeaderLabels);
    applyTableColumnOrder(saved.tableColumnOrder);

    persistState();
    render();
  }

  function saveNewRsScenarioFromPrompt() {
    const name = window.prompt("为新方案命名（保存当前模拟全部假设、表头与列顺序）：", "");
    if (name == null) return;
    const trimmed = String(name).trim();
    if (!trimmed) {
      window.alert("请输入方案名称。");
      return;
    }
    const store = loadRsScenariosStore();
    store.scenarios.push({
      id: newRsScenarioId(),
      name: trimmed,
      updatedAt: new Date().toISOString(),
      data: JSON.parse(JSON.stringify(buildPersistPayload())),
    });
    saveRsScenariosStore(store);
    refreshRsScenarioSelect();
    const sel = $("rs-scenario-select");
    if (sel) sel.value = store.scenarios[store.scenarios.length - 1].id;
  }

  function loadRsScenario() {
    const sel = $("rs-scenario-select");
    if (!sel || !sel.value) {
      window.alert("请先在列表中选择一个已保存方案。");
      return;
    }
    const store = loadRsScenariosStore();
    const s = store.scenarios.find((x) => x.id === sel.value);
    if (!s || !s.data) return;
    applyProjectionScenarioSnapshot(JSON.parse(JSON.stringify(s.data)));
    refreshRsScenarioSelect();
    sel.value = s.id;
  }

  function overwriteRsScenario() {
    const sel = $("rs-scenario-select");
    if (!sel || !sel.value) {
      window.alert("请先选择要覆盖的方案。");
      return;
    }
    if (!window.confirm("用当前模拟数据覆盖所选方案？")) return;
    const store = loadRsScenariosStore();
    const s = store.scenarios.find((x) => x.id === sel.value);
    if (!s) return;
    s.data = JSON.parse(JSON.stringify(buildPersistPayload()));
    s.updatedAt = new Date().toISOString();
    saveRsScenariosStore(store);
    refreshRsScenarioSelect();
    sel.value = s.id;
  }

  function deleteRsScenario() {
    const sel = $("rs-scenario-select");
    if (!sel || !sel.value) {
      window.alert("请先选择要删除的方案。");
      return;
    }
    if (!window.confirm("确定删除所选方案快照？（当前编辑区不受影响）")) return;
    const store = loadRsScenariosStore();
    store.scenarios = store.scenarios.filter((x) => x.id !== sel.value);
    saveRsScenariosStore(store);
    refreshRsScenarioSelect();
  }

  function loadSavedState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  /** 退休前每年末缴存 C，持续 n 年，年化 r（与 lump sum 同一口径）；r≈0 时退化为 C*n */
  function futureValueOfAnnualContributions(annual, years, r) {
    if (!Number.isFinite(annual) || annual <= 0 || !Number.isFinite(years) || years <= 0) return 0;
    if (Math.abs(r) < 1e-14) return annual * years;
    return annual * ((Math.pow(1 + r, years) - 1) / r);
  }

  function computeSchedule(st) {
    const hDob = parseISODate(st.husbandDob);
    const wDob = parseISODate(st.wifeDob);
    const childDobs = (st.children || [])
      .map((c) => parseISODate(c.dob))
      .filter((d) => d instanceof Date);
    if (!hDob || !wDob) return { rows: [], meta: { error: "请填写夫妻出生日期。" } };

    const startYear = retirementFirstCalendarYear(hDob, st.retireAgeHusband);
    const dec31 = (y) => new Date(y, 11, 31);

    const tuitionYearSets = childDobs.map((cd) => collegeTuitionCalendarYears(cd, st.tuitionYears));

    const rentalGrowth = st.rentalGrowthPct / 100;
    const inflation = st.inflationPct / 100;
    const retRate = st.annual401kReturnPct / 100;
    const brokerageGrowth = st.brokerageGrowthPct / 100;
    const withdrawRate = st.withdrawRatePct / 100;
    const taxRate = st.taxRatePct / 100;

    const totalNow = Math.max(0, st.current401kTotal || 0);
    const splitBase = nwSnapshot.husband + nwSnapshot.wife;
    const splitH = splitBase > 0 ? nwSnapshot.husband / splitBase : 0.5;
    const splitW = splitBase > 0 ? nwSnapshot.wife / splitBase : 0.5;

    const now = new Date();
    const retDate = retirementStartDate(hDob, st.retireAgeHusband);
    const yearsToRet = Math.max(0, (retDate - now) / (365.25 * 24 * 3600 * 1000));

    const lumpFV = totalNow * Math.pow(1 + retRate, yearsToRet);
    const contribAnnual = Math.max(0, st.annual401kContributionPreRetire || 0);
    const contribFV = futureValueOfAnnualContributions(contribAnnual, yearsToRet, retRate);
    const totalAtRetire = lumpFV + contribFV;
    let balH = totalAtRetire * splitH;
    let balW = totalAtRetire * splitW;
    // Brokerage 首年起始金额：按默认 8%（可改）滚到退休时点
    let brokerageBalance = Math.max(0, st.currentBrokerageTotal || 0) * Math.pow(1 + retRate, yearsToRet);

    const rows = [];

    /** 上年 Brokerage 卖出产生的资本利得税，在本日历年缴纳（与报税节奏一致） */
    let deferredBrokerageCGTaxAccrual = 0;

    for (let i = 0; i < PROJECTION_YEARS; i++) {
      const year = startYear + i;
      const cgTaxPaidThisYear = deferredBrokerageCGTaxAccrual;
      deferredBrokerageCGTaxAccrual = 0;

      const rental = st.rentalYear1 * Math.pow(1 + rentalGrowth, i);
      const living = st.livingExpenseYear1 * Math.pow(1 + inflation, i);
      const brokerageStart = brokerageBalance;

      let tuition = 0;
      tuitionYearSets.forEach((ty) => {
        if (ty.indexOf(year) >= 0) tuition += st.tuitionAnnual;
      });

      let intlSchool = 0;
      childDobs.forEach((cd) => {
        intlSchool += intlSchoolFeeForChildInYear(year, cd, st.tuitionYears, st.intlSchoolAnnual, st.intlSchoolStartAge);
      });

      balH *= 1 + retRate;
      balW *= 1 + retRate;

      const ageHf = ageYearsAt(hDob, dec31(year));
      const ageWf = ageYearsAt(wDob, dec31(year));
      const ageHi = ageOnDec31(year, hDob);
      const ageWi = ageOnDec31(year, wDob);

      const ssAnnualEachBase = st.ssMonthlyEach * 12;
      const ssStartYearH = hDob.getFullYear() + Math.floor(st.ageSS);
      const ssStartYearW = wDob.getFullYear() + Math.floor(st.ageSS);
      const ssH =
        ageHi >= st.ageSS
          ? ssAnnualEachBase * Math.pow(1 + inflation, Math.max(0, year - ssStartYearH))
          : 0;
      const ssW =
        ageWi >= st.ageSS
          ? ssAnnualEachBase * Math.pow(1 + inflation, Math.max(0, year - ssStartYearW))
          : 0;
      const ssTotal = ssH + ssW;
      const ssTaxable = ssTotal * st.ssTaxableRatio;

      const eligibleH = ageHf >= st.age401k;
      const eligibleW = ageWf >= st.age401k;

      function taxesAndFlow(wH, wW) {
        const k401T = wH + wW;
        const ordinaryIncome0 = rental + k401T + ssTaxable;
        const taxableOrdinaryIncome0 = Math.max(0, ordinaryIncome0 - st.standardDeduction);
        const federalTax0 = calcProgressiveTax(taxableOrdinaryIncome0, FEDERAL_BRACKETS_MFJ);
        const stateTax0 = ordinaryIncome0 * taxRate;
        const tax0 = federalTax0 + stateTax0;
        const expense0 = living + intlSchool + tuition + tax0;
        const income0 = rental + k401T + ssTotal;
        return { tax: tax0, expense: expense0, income: income0, k401Total: k401T, ordinaryIncome: ordinaryIncome0 };
      }

      let wdH = 0;
      let wdW = 0;
      /** 当年 Brokerage 卖出毛额 B（扣减账户余额用）；表列「提款」展示税后补缺 (1−r)×B，即填补收支缺口的净现金 */
      let brokerageSaleGross = 0;

      if (!eligibleH && !eligibleW) {
        const flow0 = taxesAndFlow(0, 0);
        // A：现金缺口（含本日历年需缴纳的上年卖出资本利得税 cgTaxPaidThisYear）；净补缺 (1−r)×B = A ⇒ B = A/(1−r)；本年卖出对应的税 B×r 递延至下一年缴纳
        const A = Math.max(0, flow0.expense + cgTaxPaidThisYear - flow0.income);
        const rate = Math.max(0, Math.min(0.9999, (st.brokerageCapitalGainTaxPct || 0) / 100));
        const netFraction = 1 - rate;
        if (A > 0 && brokerageStart > 0 && netFraction > 1e-9) {
          brokerageSaleGross = Math.min(A / netFraction, brokerageStart);
          deferredBrokerageCGTaxAccrual = brokerageSaleGross * rate;
        }
        brokerageBalance = brokerageStart - brokerageSaleGross;
      } else {
        wdH = eligibleH ? scheduled401kWithdrawalForAccount(balH, ageHf, ageHi, st, withdrawRate) : 0;
        wdW = eligibleW ? scheduled401kWithdrawalForAccount(balW, ageWf, ageWi, st, withdrawRate) : 0;

        for (let iter = 0; iter < 55; iter++) {
          const { expense: expI, income: incI } = taxesAndFlow(wdH, wdW);
          const gap = expI + cgTaxPaidThisYear - incI;
          if (gap <= 1) break;
          const remH = eligibleH ? Math.max(0, balH - wdH) : 0;
          const remW = eligibleW ? Math.max(0, balW - wdW) : 0;
          const rem = remH + remW;
          if (rem <= 0.01) break;
          const step = Math.min(gap * 1.12, rem);
          const shareH = rem > 0 ? remH / rem : 0;
          const shareW = rem > 0 ? remW / rem : 0;
          wdH = eligibleH ? Math.min(balH, wdH + step * shareH) : 0;
          wdW = eligibleW ? Math.min(balW, wdW + step * shareW) : 0;
        }

        balH -= wdH;
        balW -= wdW;
        brokerageSaleGross = 0;
        brokerageBalance = brokerageStart;
      }

      const cgRate = Math.max(0, Math.min(0.9999, (st.brokerageCapitalGainTaxPct || 0) / 100));
      const brokerageWithdrawal = brokerageSaleGross * (1 - cgRate);

      const { tax, expense: expenseBase, income, k401Total } = taxesAndFlow(wdH, wdW);
      const brokerageCGTax = cgTaxPaidThisYear;
      const expense = expenseBase + brokerageCGTax;
      const net = income + brokerageWithdrawal - expense;

      rows.push({
        year,
        ageH: ageOnDec31(year, hDob),
        rental,
        k401Total,
        k401Balance: balH + balW,
        brokerageStart,
        brokerageBalance,
        brokerageWithdrawal,
        brokerageCGTax,
        ssTotal,
        tax,
        intlSchool,
        tuition,
        living,
        income,
        expense,
        net,
      });

      // 下一年开始前，按设定增长率增长
      brokerageBalance *= 1 + brokerageGrowth;
    }

    return {
      rows,
      meta: {
        startYear,
        endYear: startYear + PROJECTION_YEARS - 1,
        total401kNow: totalNow,
        total401kAtRetire: totalAtRetire,
        yearsToRetirement: yearsToRet,
        lumpSumAtRetire: lumpFV,
        preRetire401kAnnual: contribAnnual,
        preRetireContribAtRetire: contribFV,
      },
    };
  }

  function renderTable(result) {
    const tbody = $("rs-tbody");
    const summary = $("rs-summary");
    if (!tbody || !summary) return;
    if (result.meta && result.meta.error) {
      summary.textContent = result.meta.error;
      tbody.innerHTML = "";
      return;
    }

    const { rows, meta } = result;
    let sumNet = 0;
    let sumIncome = 0;
    let sumExpense = 0;

    const colOrder = normalizeTableColumnOrder(collectTableColumnOrderFromDom());
    tbody.innerHTML = rows
      .map((r) => {
        sumNet += r.net;
        sumIncome += r.income;
        sumExpense += r.expense;
        const cellMap = {
          year: `<td class="rs-num">${r.year}</td>`,
          ageH: `<td class="rs-num">${r.ageH}</td>`,
          k401Total: `<td class="rs-num rs-income">${formatCurrency(r.k401Total)}</td>`,
          k401Balance: `<td class="rs-num">${formatCurrency(r.k401Balance)}</td>`,
          brokerageStart: `<td class="rs-num">${formatCurrency(r.brokerageStart)}</td>`,
          brokerageWithdrawal: `<td class="rs-num rs-expense">${r.brokerageWithdrawal > 0 ? formatCurrency(r.brokerageWithdrawal) : "—"}</td>`,
          brokerageCGTax: `<td class="rs-num rs-expense">${r.brokerageCGTax > 0 ? formatCurrency(r.brokerageCGTax) : "—"}</td>`,
          brokerageBalance: `<td class="rs-num">${formatCurrency(r.brokerageBalance)}</td>`,
          rental: `<td class="rs-num rs-income">${formatCurrency(r.rental)}</td>`,
          ssTotal: `<td class="rs-num rs-income">${formatCurrency(r.ssTotal)}</td>`,
          tax: `<td class="rs-num rs-expense">${formatCurrency(r.tax)}</td>`,
          intlSchool: `<td class="rs-num rs-expense">${r.intlSchool > 0 ? formatCurrency(r.intlSchool) : "—"}</td>`,
          tuition: `<td class="rs-num rs-expense">${r.tuition > 0 ? formatCurrency(r.tuition) : "—"}</td>`,
          living: `<td class="rs-num rs-expense">${formatCurrency(r.living)}</td>`,
          income: `<td class="rs-num rs-income">${formatCurrency(r.income)}</td>`,
          expense: `<td class="rs-num rs-expense">${formatCurrency(r.expense)}</td>`,
        };
        return `<tr>${colOrder.map((k) => cellMap[k] || "").join("")}</tr>`;
      })
      .join("");

    const ytr =
      meta.yearsToRetirement != null && Number.isFinite(meta.yearsToRetirement)
        ? meta.yearsToRetirement.toFixed(1)
        : "—";
    const retPct = $("rs-401k-return")?.value || DEFAULTS.annual401kReturnPct;
    const preAnn = meta.preRetire401kAnnual != null ? formatCurrency(meta.preRetire401kAnnual) : formatCurrency(0);
    const lumpEnd = meta.lumpSumAtRetire != null ? formatCurrency(meta.lumpSumAtRetire) : "—";
    const contribEnd =
      meta.preRetireContribAtRetire != null ? formatCurrency(meta.preRetireContribAtRetire) : formatCurrency(0);

    summary.innerHTML = [
      `预测区间：<strong>${meta.startYear}</strong>–<strong>${meta.endYear}</strong>（共 ${PROJECTION_YEARS} 年）。`,
      `401(k) 推算：当前总余额 <strong>${formatCurrency(meta.total401kNow)}</strong>；距退休约 <strong>${ytr}</strong> 年，退休前每年缴存 <strong>${preAnn}</strong>（与账户同按年化 <strong>${retPct}%</strong> 复合增长；退休首年起不再追加缴存）。原有余额滚至约 <strong>${lumpEnd}</strong>，缴存及其增长约 <strong>${contribEnd}</strong>，合并退休起点约 <strong>${formatCurrency(meta.total401kAtRetire)}</strong>；提取按 <strong>${$("rs-401k-withdraw-rate")?.value || DEFAULTS.withdrawRatePct}%</strong>，且 ${$("rs-rmd-start")?.value || DEFAULTS.rmdStartAge} 岁起不低于 RMD。`,
      `Tax 估算：Ordinary income 先扣 standard deduction（默认 MFJ <strong>${formatCurrency($("rs-std-deduction")?.value || DEFAULTS.standardDeduction)}</strong>）后走 federal progressive brackets；社安按 <strong>${Math.round((($("rs-ss-taxable-ratio")?.value || DEFAULTS.ssTaxableRatio) * 100))}%</strong> 计入应税普通收入；另可叠加州税率 <strong>${$("rs-tax-rate")?.value || DEFAULTS.taxRatePct}%</strong>。`,
      `50 年合计：收入 <strong>${formatCurrency(sumIncome)}</strong>，支出 <strong>${formatCurrency(sumExpense)}</strong>，净现金流 <strong>${formatCurrencySigned(sumNet)}</strong>。`,
    ].join("<br/>");
  }

  function render() {
    renderTable(computeSchedule(getFormState()));
  }

  function applyNw401kTotal() {
    nwSnapshot = load401kFromNetWorth();
    const totalEl = $("rs-401k-total");
    const brokerageEl = $("rs-brokerage-total");
    const hint = $("rs-nw-hint");

    if (totalEl) totalEl.value = formatCurrency(Math.round(nwSnapshot.total || 0));
    if (brokerageEl) brokerageEl.value = formatCurrency(Math.round(nwSnapshot.brokerageTotal || 0));

    if (hint) {
      if (!nwSnapshot.ok) {
        hint.textContent = "未读取到「家庭净资产」存档；请先在「家庭净资产」中填写并保存，或手动填写当前总 401(k) 与 Brokerage。";
      } else {
        hint.textContent = `已同步：401(k)/403(b) 总计 ${formatCurrency(nwSnapshot.total)}；Brokerage 总计 ${formatCurrency(nwSnapshot.brokerageTotal)}。`;
      }
    }

    persistState();
    render();
  }

  function init() {
    nwSnapshot = load401kFromNetWorth();

    const saved = loadSavedState() || {};
    const merged = Object.assign({}, DEFAULTS);
    Object.keys(DEFAULTS).forEach((k) => {
      if (Object.prototype.hasOwnProperty.call(saved, k) && saved[k] != null && saved[k] !== "") merged[k] = saved[k];
    });
    merged.children = normalizeChildrenFromSaved(saved);

    if (!(Object.prototype.hasOwnProperty.call(saved, "current401kTotal")) || saved.current401kTotal === "") {
      merged.current401kTotal = nwSnapshot.total || 0;
    }
    if (!(Object.prototype.hasOwnProperty.call(saved, "currentBrokerageTotal")) || saved.currentBrokerageTotal === "") {
      merged.currentBrokerageTotal = nwSnapshot.brokerageTotal || 0;
    }

    setFormState(merged);
    renderChildrenFromState(merged.children);

    const labelsMerged = Object.assign(
      {},
      DEFAULT_ASSUMPTION_LABELS,
      saved.assumptionLabels && typeof saved.assumptionLabels === "object" ? saved.assumptionLabels : {}
    );
    applyAssumptionLabels(labelsMerged);
    applyAssumptionOrder(saved.assumptionOrder);
    applyTableHeaderLabels(saved.tableHeaderLabels);
    applyTableColumnOrder(saved.tableColumnOrder);

    const projPanel = $("panel-projection");
    if (projPanel) {
      projPanel.addEventListener("change", () => {
        persistState();
        render();
      });
      projPanel.addEventListener("input", () => {
        persistState();
        render();
      });
    }

    [
      "rs-rental-y1",
      "rs-ss-monthly",
      "rs-tuition",
      "rs-intl-annual",
      "rs-living-y1",
      "rs-401k-total",
      "rs-401k-pre-annual",
      "rs-brokerage-total",
      "rs-std-deduction",
    ].forEach((id) => bindMoneyInput($(id), () => { persistState(); render(); }));

    initAssumptionDrag();
    initTableColumnDrag();
    initChildrenUi();

    const btnNw = $("rs-btn-nw");
    if (btnNw) btnNw.addEventListener("click", () => applyNw401kTotal());

    const rsSn = $("rs-scenario-save-new");
    const rsLd = $("rs-scenario-load");
    const rsOw = $("rs-scenario-overwrite");
    const rsDel = $("rs-scenario-delete");
    if (rsSn) rsSn.addEventListener("click", saveNewRsScenarioFromPrompt);
    if (rsLd) rsLd.addEventListener("click", loadRsScenario);
    if (rsOw) rsOw.addEventListener("click", overwriteRsScenario);
    if (rsDel) rsDel.addEventListener("click", deleteRsScenario);

    applyNw401kTotal();
    refreshRsScenarioSelect();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
