(function () {
  "use strict";

  const STORAGE_KEY_V2 = "household-net-worth-v2";
  const STORAGE_KEY_V1 = "household-net-worth-v1";
  const SCENARIOS_KEY = "household-net-worth-scenarios-v1";

  const DEFAULT_ASSETS = [
    "401(k) / 403(b)",
    "Traditional IRA",
    "Roth IRA",
    "HSA",
    "经纪账户（Brokerage）",
    "支票 / 储蓄等现金",
    "Money Market / CDs",
    "人寿保险（现金价值）",
    "529 / 教育账户",
    "I Bonds / 短期国债等",
    "加密货币",
    "贵金属 / 大宗商品",
    "养老金/年金（现值估计）",
    "车辆等残值",
    "其他资产",
  ];

  const DEFAULT_LIABILITIES = [
    "信用卡",
    "学生贷款",
    "车贷（非房贷部分）",
    "HELOC / 私人借贷",
    "Margin / 证券融资",
    "其他负债",
  ];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  let propSeq = 0;
  let assetSeq = 0;
  let liabSeq = 0;
  let personSeq = 0;
  /** @type {Array<Record<string, any>>} */
  let investmentProperties = [];

  /** @type {{ id: string, name: string }[]} */
  let people = [];

  function bumpSeqFromId(prefix, id) {
    const m = new RegExp(`^${prefix}-(\\d+)$`).exec(id || "");
    if (!m) return;
    const next = parseInt(m[1], 10) + 1;
    if (prefix === "p") propSeq = Math.max(propSeq, next);
    else if (prefix === "a") assetSeq = Math.max(assetSeq, next);
    else if (prefix === "l") liabSeq = Math.max(liabSeq, next);
    else if (prefix === "u") personSeq = Math.max(personSeq, next);
  }

  function parseNum(el) {
    if (el == null) return 0;
    if (typeof el === "string") {
      const v = parseFloat(el.replace(/[$,\s]/g, ""));
      return Number.isFinite(v) && v >= 0 ? v : 0;
    }
    const v = parseFloat(String(el.value).replace(/[$,\s]/g, ""));
    return Number.isFinite(v) && v >= 0 ? v : 0;
  }

  function parseNumLoose(el) {
    if (el == null) return 0;
    const raw = typeof el === "string" ? el : String(el.value);
    const v = parseFloat(raw.replace(/[$,\s]/g, ""));
    return Number.isFinite(v) ? v : 0;
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

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function monthlyRateAnnualPct(annualPct) {
    return annualPct / 100 / 12;
  }

  /** Months from first day of purchase month to "today" (start of current month for stability). */
  function monthsElapsedFromYm(purchaseYm) {
    if (!purchaseYm || typeof purchaseYm !== "string") return 0;
    const parts = purchaseYm.split("-");
    if (parts.length < 2) return 0;
    const y = parseInt(parts[0], 10);
    const mo = parseInt(parts[1], 10);
    if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) return 0;
    const now = new Date();
    const endY = now.getFullYear();
    const endM = now.getMonth() + 1;
    let months = (endY - y) * 12 + (endM - mo);
    return Math.max(0, months);
  }

  /**
   * Remaining balance after k monthly payments (same payment each month).
   * principal > 0, annualPct >= 0, years > 0, k >= 0
   */
  function remainingLoanBalance(principal, annualPct, years, monthsPaid) {
    const n = Math.max(1, Math.round(years * 12));
    const k = Math.max(0, Math.min(monthsPaid, n));
    if (principal <= 0) return 0;
    if (k >= n) return 0;

    const r = monthlyRateAnnualPct(annualPct);
    if (r <= 1e-12) {
      return Math.max(0, principal - (principal * k) / n);
    }
    const powN = Math.pow(1 + r, n);
    const powK = Math.pow(1 + r, k);
    return (principal * (powN - powK)) / (powN - 1);
  }

  function syncDownPayUi(row) {
    const sel = row.querySelector('[data-field="downPayMode"]');
    const inp = row.querySelector('[data-field="downPayment"]');
    if (!sel || !inp) return;
    const pct = sel.value === "percent";
    if (pct) {
      inp.setAttribute("max", "100");
      inp.step = "0.01";
      inp.placeholder = "如 25";
      inp.value = stripCurrencyText(inp.value);
    } else {
      inp.removeAttribute("max");
      inp.step = "any";
      inp.placeholder = "$0";
      inp.value = formatInputCurrency(inp.value);
    }
  }

  /** 首付折算为货币（按比例时为购房价 × 百分比） */
  function downPaymentInDollars(mode, rawValue, purchasePrice) {
    const raw = parseNumLoose(rawValue);
    if (mode === "percent") {
      const p = Math.min(100, Math.max(0, raw));
      return (purchasePrice * p) / 100;
    }
    return Math.max(0, raw);
  }

  function computePropertyNumbersFromValues(v) {
    const price = parseNum(v.purchasePrice);
    const mode = v.downPayMode === "percent" ? "percent" : "amount";
    const down = downPaymentInDollars(mode, v.downPayment, price);
    const rate = parseNumLoose(v.annualRate);
    const years = parseNumLoose(v.loanYears);
    const ym = v.purchaseYm || "";
    const currentValRaw =
      String(v.currentValue ?? "").trim() !== "" ? parseNum(v.currentValue) : NaN;
    const legacyRemaining =
      v.legacyRemaining != null && v.legacyRemaining !== ""
        ? parseNumLoose(v.legacyRemaining)
        : null;

    const principal = Math.max(0, price - down);
    const loanYears = years > 0 ? years : 30;
    const monthsPaid = monthsElapsedFromYm(ym);
    let remaining;

    const canAmortize = ym && principal > 0 && loanYears > 0 && rate >= 0;

    if (canAmortize) {
      remaining = remainingLoanBalance(principal, rate, loanYears, monthsPaid);
    } else if (legacyRemaining != null && Number.isFinite(legacyRemaining)) {
      remaining = Math.max(0, legacyRemaining);
    } else if (principal <= 0) {
      remaining = 0;
    } else {
      remaining = principal;
    }

    const market =
      Number.isFinite(currentValRaw) && currentValRaw >= 0 ? currentValRaw : price;
    const equity = market - remaining;

    return {
      principal,
      remaining,
      equity,
      monthsPaid,
      market,
      hasYm: !!ym,
      downPayMode: mode,
      downPaymentRaw: parseNumLoose(v.downPayment),
    };
  }

  function getPropertyValuesFromRow(row) {
    return {
      purchasePrice: (row.querySelector('[data-field="purchasePrice"]') || {}).value || "",
      downPayMode:
        (row.querySelector('[data-field="downPayMode"]') || {}).value || "amount",
      downPayment: (row.querySelector('[data-field="downPayment"]') || {}).value || "",
      annualRate: (row.querySelector('[data-field="annualRate"]') || {}).value || "",
      loanYears: (row.querySelector('[data-field="loanYears"]') || {}).value || "",
      purchaseYm: (row.querySelector('[data-field="purchaseYm"]') || {}).value || "",
      currentValue: (row.querySelector('[data-field="currentValue"]') || {}).value || "",
      legacyRemaining: (row.querySelector('[data-field="legacyRemaining"]') || {}).value || "",
    };
  }

  function computePropertyNumbers(row) {
    return computePropertyNumbersFromValues(getPropertyValuesFromRow(row));
  }

  function updatePropertyReadouts(row) {
    const pr = row.querySelector('[data-readout="principal"]');
    const rem = row.querySelector('[data-readout="remaining"]');
    const mo = row.querySelector('[data-readout="monthsPaid"]');
    const eq = row.querySelector("[data-equity]");
    const nums = computePropertyNumbers(row);

    if (pr) {
      let extra = "";
      if (nums.downPayMode === "percent" && nums.downPaymentRaw > 0 && nums.principal > 0) {
        extra = `（首付 ${nums.downPaymentRaw}%）`;
      }
      pr.textContent =
        nums.principal > 0 ? `贷款本金 ${formatCurrency(nums.principal)}${extra}` : "贷款本金 —";
    }
    if (rem) {
      rem.textContent =
        nums.principal > 0 || nums.remaining > 0
          ? `剩余房贷 ${formatCurrency(nums.remaining)}`
          : "剩余房贷 —";
    }
    if (mo) {
      mo.textContent =
        nums.hasYm && nums.principal > 0
          ? `已计 ${nums.monthsPaid} 个月还款`
          : "—";
    }
    if (eq) {
      if (nums.principal <= 0 && parseNum(row.querySelector('[data-field="purchasePrice"]')) <= 0) {
        eq.textContent = "净值 —";
        eq.classList.add("muted");
        eq.classList.remove("negative");
      } else {
        eq.textContent = formatCurrencySigned(nums.equity);
        eq.classList.remove("muted");
        eq.classList.toggle("negative", nums.equity < 0);
      }
    }
  }

  function propertyEquity(row) {
    return computePropertyNumbers(row).equity;
  }

  function getRealEstateEquity() {
    let sum = 0;
    const primary = $("#nw-primary-row .nw-property-card");
    if (primary) sum += propertyEquity(primary);
    investmentProperties.forEach((p) => {
      sum += computePropertyNumbersFromValues(p).equity;
    });
    return sum;
  }

  function getAssetsTotal() {
    let sum = 0;
    $$("#nw-assets-list .nw-asset-row").forEach((row) => {
      people.forEach((p) => {
        const inp = row.querySelector(`input[data-person-id="${p.id}"]`);
        sum += parseNum(inp);
      });
    });
    return sum;
  }

  function getLiabilitiesTotal() {
    let sum = 0;
    $$("#nw-liabilities-list .nw-liab-row").forEach((row) => {
      sum += parseNum(row.querySelector('[data-field="amount"]'));
    });
    return sum;
  }

  function updateAssetRowTotal(row) {
    const span = row.querySelector("[data-row-total]");
    if (!span) return;
    let s = 0;
    people.forEach((p) => {
      const inp = row.querySelector(`input[data-person-id="${p.id}"]`);
      s += parseNum(inp);
    });
    span.textContent = formatCurrency(s);
  }

  function renderAssetsFooter() {
    const foot = $("#nw-assets-matrix-foot");
    if (!foot) return;
    foot.innerHTML = "";
    const dragSp = document.createElement("div");
    dragSp.className = "nw-mat-drag-foot-spacer";
    dragSp.setAttribute("aria-hidden", "true");
    foot.appendChild(dragSp);

    const label = document.createElement("div");
    label.className = "nw-mat-foot-label";
    label.textContent = "成员列合计";
    foot.appendChild(label);

    const personWrap = document.createElement("div");
    personWrap.className = "nw-mat-person-region nw-mat-foot-person-region";
    people.forEach((p) => {
      const cell = document.createElement("div");
      cell.className = "nw-mat-cell nw-mat-person-sum";
      cell.dataset.personId = p.id;
      const total = $$("#nw-assets-list .nw-asset-row").reduce((acc, row) => {
        const inp = row.querySelector(`input[data-person-id="${p.id}"]`);
        return acc + parseNum(inp);
      }, 0);
      cell.textContent = formatCurrency(total);
      personWrap.appendChild(cell);
    });
    foot.appendChild(personWrap);

    const grand = document.createElement("div");
    grand.className = "nw-mat-cell nw-mat-grand-sum";
    grand.textContent = formatCurrency(getAssetsTotal());
    foot.appendChild(grand);

    const spacer = document.createElement("div");
    spacer.className = "nw-mat-actions-spacer";
    spacer.setAttribute("aria-hidden", "true");
    foot.appendChild(spacer);
  }

  function renderPeopleHeader() {
    const head = $("#nw-asset-people-header");
    if (!head) return;
    head.innerHTML = "";
    people.forEach((p, idx) => {
      const wrap = document.createElement("div");
      wrap.className = "nw-mat-person-head";
      wrap.dataset.personId = p.id;
      const inp = document.createElement("input");
      inp.type = "text";
      inp.className = "nw-person-name-input";
      inp.placeholder = "姓名";
      inp.value = p.name || "";
      inp.dataset.personId = p.id;
      inp.addEventListener("input", () => {
        p.name = inp.value;
        persist();
      });
      wrap.appendChild(inp);
      if (people.length > 1) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "nw-person-remove";
        btn.textContent = "×";
        btn.title = "移除此成员列";
        btn.addEventListener("click", () => removePerson(p.id));
        wrap.appendChild(btn);
      }
      head.appendChild(wrap);
    });
  }

  function syncAssetRowsPersonInputs() {
    $$("#nw-assets-list .nw-asset-row").forEach((row) => {
      const container = row.querySelector("[data-person-amounts]");
      if (!container) return;
      const existing = {};
      container.querySelectorAll("input[data-person-id]").forEach((inp) => {
        existing[inp.dataset.personId] = inp.value;
      });
      container.innerHTML = "";
      people.forEach((p) => {
        const inp = document.createElement("input");
        inp.type = "text";
        inp.className = "nw-inp-num nw-mat-person-input";
        inp.dataset.personId = p.id;
        inp.placeholder = "$0";
        inp.inputMode = "decimal";
        if (existing[p.id] != null) inp.value = formatInputCurrency(existing[p.id]);
        inp.addEventListener("input", () => {
          updateAssetRowTotal(row);
          renderAssetsFooter();
          recalc();
        });
        bindMoneyInput(inp, recalc);
        container.appendChild(inp);
      });
      updateAssetRowTotal(row);
    });
    renderAssetsFooter();
  }

  function addPerson(savedName) {
    const id = `u-${personSeq++}`;
    bumpSeqFromId("u", id);
    people.push({ id, name: savedName != null ? savedName : `成员${people.length + 1}` });
    renderPeopleHeader();
    syncAssetRowsPersonInputs();
    recalc();
  }

  function removePerson(pid) {
    if (people.length <= 1) return;
    people = people.filter((p) => p.id !== pid);
    renderPeopleHeader();
    syncAssetRowsPersonInputs();
    recalc();
  }

  function serializeAll() {
    const primaryEl = $("#nw-primary-row .nw-property-card");
    return {
      version: 2,
      people: people.map((p) => ({ id: p.id, name: p.name })),
      primary: primaryEl ? serializePropertyCard(primaryEl) : null,
      properties: investmentProperties.map((p) => ({ ...p })),
      assets: $$("#nw-assets-list .nw-asset-row").map((row) => serializeAssetRow(row)),
      liabilities: $$("#nw-liabilities-list .nw-liab-row").map((row) => ({
        id: row.dataset.liabilityId || "",
        label: (row.querySelector('[data-field="label"]') || {}).value || "",
        amount: (row.querySelector('[data-field="amount"]') || {}).value || "",
      })),
    };
  }

  function loadScenariosStore() {
    try {
      const raw = localStorage.getItem(SCENARIOS_KEY);
      if (raw) {
        const o = JSON.parse(raw);
        if (o && Array.isArray(o.scenarios)) return o;
      }
    } catch (_) {}
    return { scenarios: [] };
  }

  function saveScenariosStore(store) {
    try {
      localStorage.setItem(SCENARIOS_KEY, JSON.stringify(store));
    } catch (_) {}
  }

  function newScenarioId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return `sc-${crypto.randomUUID()}`;
    }
    return `sc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function refreshScenarioSelectOptions() {
    const sel = $("#nw-scenario-select");
    if (!sel) return;
    const prev = sel.value;
    const store = loadScenariosStore();
    sel.innerHTML = '<option value="">— 选择已保存方案 —</option>';
    store.scenarios.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.id;
      const dateStr =
        s.updatedAt && typeof s.updatedAt === "string"
          ? new Date(s.updatedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
          : "";
      opt.textContent = dateStr ? `${s.name || "未命名"} · ${dateStr}` : s.name || "未命名";
      opt.title = s.name || "";
      sel.appendChild(opt);
    });
    if (prev && [...sel.options].some((o) => o.value === prev)) {
      sel.value = prev;
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(serializeAll()));
    } catch (_) {}
  }

  /**
   * 用已序列化的 v2 对象完整替换当前页状态（成员、自住房、投资房矩阵、资产表、负债表）。
   */
  function hydrateFromData(data) {
    propSeq = 0;
    assetSeq = 0;
    liabSeq = 0;
    personSeq = 0;
    people = [];
    investmentProperties = [];

    if (Array.isArray(data.people) && data.people.length) {
      data.people.forEach((p) => {
        const id = p.id || `u-${personSeq++}`;
        bumpSeqFromId("u", id);
        people.push({ id, name: p.name || "" });
      });
    } else {
      people = [{ id: "u-0", name: "成员1" }];
      personSeq = 1;
    }

    renderPeopleHeader();

    $("#nw-investment-list").innerHTML = "";
    $("#nw-invest-col-heads").innerHTML = "";
    $("#nw-assets-list").innerHTML = "";
    $("#nw-liabilities-list").innerHTML = "";

    renderPrimary(data.primary || null);

    if (Array.isArray(data.properties)) {
      data.properties.forEach((p) => investmentProperties.push(createInvestmentProperty(p)));
    }
    renderInvestmentMatrix();

    if (Array.isArray(data.assets) && data.assets.length) {
      data.assets.forEach((a) => addAssetRow(null, a));
    } else {
      DEFAULT_ASSETS.forEach((label) => addAssetRow(label, null));
    }

    if (Array.isArray(data.liabilities) && data.liabilities.length) {
      data.liabilities.forEach((x) => addLiabilityRow(null, x));
    } else {
      DEFAULT_LIABILITIES.forEach((label) => addLiabilityRow(label, null));
    }

    syncAssetRowsPersonInputs();
    updateInvEmpty();
    recalc();
  }

  function saveNewScenarioFromPrompt() {
    const name = window.prompt("为新方案命名（保存当前表格中的全部数据）：", "");
    if (name == null) return;
    const trimmed = String(name).trim();
    if (!trimmed) {
      window.alert("请输入方案名称。");
      return;
    }
    const store = loadScenariosStore();
    store.scenarios.push({
      id: newScenarioId(),
      name: trimmed,
      updatedAt: new Date().toISOString(),
      data: JSON.parse(JSON.stringify(serializeAll())),
    });
    saveScenariosStore(store);
    refreshScenarioSelectOptions();
    const sel = $("#nw-scenario-select");
    if (sel) sel.value = store.scenarios[store.scenarios.length - 1].id;
  }

  function loadSelectedScenario() {
    const sel = $("#nw-scenario-select");
    if (!sel || !sel.value) {
      window.alert("请先在列表中选择一个已保存方案。");
      return;
    }
    const store = loadScenariosStore();
    const s = store.scenarios.find((x) => x.id === sel.value);
    if (!s || !s.data) return;
    hydrateFromData(JSON.parse(JSON.stringify(s.data)));
    refreshScenarioSelectOptions();
    sel.value = s.id;
  }

  function overwriteSelectedScenario() {
    const sel = $("#nw-scenario-select");
    if (!sel || !sel.value) {
      window.alert("请先选择要覆盖的方案。");
      return;
    }
    if (!window.confirm("用当前表格数据覆盖所选方案？")) return;
    const store = loadScenariosStore();
    const s = store.scenarios.find((x) => x.id === sel.value);
    if (!s) return;
    s.data = JSON.parse(JSON.stringify(serializeAll()));
    s.updatedAt = new Date().toISOString();
    saveScenariosStore(store);
    refreshScenarioSelectOptions();
    sel.value = s.id;
  }

  function deleteSelectedScenario() {
    const sel = $("#nw-scenario-select");
    if (!sel || !sel.value) {
      window.alert("请先选择要删除的方案。");
      return;
    }
    if (!window.confirm("确定删除所选方案快照？（当前编辑区不受影响）")) return;
    const store = loadScenariosStore();
    store.scenarios = store.scenarios.filter((x) => x.id !== sel.value);
    saveScenariosStore(store);
    refreshScenarioSelectOptions();
  }

  function recalc() {
    const re = getRealEstateEquity();
    const fin = getAssetsTotal();
    const liab = getLiabilitiesTotal();
    const total = re + fin - liab;

    const elT = $("#nw-out-total");
    elT.textContent = formatCurrencySigned(total);
    elT.classList.remove("positive", "negative");
    elT.classList.add(total >= 0 ? "positive" : "negative");

    $("#nw-out-re").textContent = formatCurrency(re);
    $("#nw-out-fin").textContent = formatCurrency(fin);
    $("#nw-out-liab").textContent = `−${formatCurrency(liab)}`;

    $("#nw-hero-formula").textContent =
      "房产净值 " +
      formatCurrency(re) +
      " + 资产 " +
      formatCurrency(fin) +
      " − 负债 " +
      formatCurrency(liab) +
      " = 总净资产";

    $$(".nw-property-card").forEach((row) => updatePropertyReadouts(row));
    refreshInvestmentComputedDisplays();
    $$("#nw-assets-list .nw-asset-row").forEach((row) => updateAssetRowTotal(row));
    renderAssetsFooter();
    persist();
  }

  function serializePropertyCard(row) {
    const o = {
      id: row.dataset.propertyId || "",
      label: (row.querySelector('[data-field="label"]') || {}).value || "",
      purchasePrice: (row.querySelector('[data-field="purchasePrice"]') || {}).value || "",
      downPayMode: (row.querySelector('[data-field="downPayMode"]') || {}).value || "amount",
      downPayment: (row.querySelector('[data-field="downPayment"]') || {}).value || "",
      annualRate: (row.querySelector('[data-field="annualRate"]') || {}).value || "",
      loanYears: (row.querySelector('[data-field="loanYears"]') || {}).value || "",
      purchaseYm: (row.querySelector('[data-field="purchaseYm"]') || {}).value || "",
      currentValue: (row.querySelector('[data-field="currentValue"]') || {}).value || "",
    };
    const leg = row.querySelector('[data-field="legacyRemaining"]');
    if (leg && leg.value !== "") o.legacyRemaining = leg.value;
    return o;
  }

  function serializeAssetRow(row) {
    const labelInp = row.querySelector('[data-field="label"]');
    const amounts = {};
    people.forEach((p) => {
      const inp = row.querySelector(`input[data-person-id="${p.id}"]`);
      amounts[p.id] = inp ? inp.value : "";
    });
    return {
      id: row.dataset.assetId || "",
      label: labelInp ? labelInp.value : "",
      amounts,
    };
  }

  function bindPropertyCard(row, opts) {
    const optsRemove = opts && opts.removeButton;
    row.querySelectorAll('[data-field]').forEach((el) => {
      if (el.dataset.field === "legacyRemaining") return;
      const handler = () => {
        const leg = row.querySelector('[data-field="legacyRemaining"]');
        if (leg && el.dataset.field !== "legacyRemaining") leg.value = "";
        if (el.dataset.field === "downPayMode") syncDownPayUi(row);
        recalc();
      };
      const evt = el.tagName === "SELECT" ? "change" : "input";
      el.addEventListener(evt, handler);
    });
    const leg = row.querySelector('[data-field="legacyRemaining"]');
    if (leg) {
      leg.addEventListener("input", () => {
        recalc();
      });
    }

    const purchaseEl = row.querySelector('[data-field="purchasePrice"]');
    const downEl = row.querySelector('[data-field="downPayment"]');
    const currentEl = row.querySelector('[data-field="currentValue"]');
    const modeEl = row.querySelector('[data-field="downPayMode"]');

    const bindCurrencyInput = (inp, isPercentModeFn) => {
      if (!inp) return;
      inp.addEventListener("focus", () => {
        inp.value = stripCurrencyText(inp.value);
      });
      inp.addEventListener("blur", () => {
        if (isPercentModeFn && isPercentModeFn()) {
          inp.value = stripCurrencyText(inp.value);
        } else {
          inp.value = formatInputCurrency(inp.value);
        }
        recalc();
      });
    };

    bindCurrencyInput(purchaseEl, null);
    bindCurrencyInput(currentEl, null);
    bindCurrencyInput(downEl, () => modeEl && modeEl.value === "percent");
    if (optsRemove) {
      row.querySelector("[data-action=remove]")?.addEventListener("click", () => {
        row.remove();
        updateInvEmpty();
        recalc();
      });
    }
  }

  function fillPropertyCard(row, saved) {
    if (!saved || typeof saved !== "object") return;
    const set = (field, val) => {
      const el = row.querySelector(`[data-field="${field}"]`);
      if (el && val != null) el.value = val;
    };
    set("label", saved.label);
    set("purchasePrice", saved.purchasePrice);
    const modeSel = row.querySelector('[data-field="downPayMode"]');
    if (modeSel) {
      modeSel.value = saved.downPayMode === "percent" ? "percent" : "amount";
    }
    set("downPayment", saved.downPayment);
    syncDownPayUi(row);
    set("annualRate", saved.annualRate);
    set("loanYears", saved.loanYears != null && saved.loanYears !== "" ? saved.loanYears : "30");
    set("purchaseYm", saved.purchaseYm);
    set("currentValue", saved.currentValue);
    if (saved.legacyRemaining != null) {
      const leg = row.querySelector('[data-field="legacyRemaining"]');
      if (leg) leg.value = saved.legacyRemaining;
    }
    const purchaseEl = row.querySelector('[data-field="purchasePrice"]');
    const currentEl = row.querySelector('[data-field="currentValue"]');
    if (purchaseEl) purchaseEl.value = formatInputCurrency(purchaseEl.value);
    if (currentEl) currentEl.value = formatInputCurrency(currentEl.value);
  }

  function createPropertyCardFromTemplate(primary, saved) {
    const tplId = primary ? "tpl-nw-property-primary" : "tpl-nw-property";
    const tpl = $(`#${tplId}`);
    const node = tpl.content.cloneNode(true);
    const row = node.querySelector(".nw-property-card");
    const id =
      saved && saved.id
        ? saved.id
        : `p-${propSeq++}`;
    row.dataset.propertyId = id;
    bumpSeqFromId("p", id);
    fillPropertyCard(row, saved);
    syncDownPayUi(row);
    bindPropertyCard(row, { removeButton: !primary });
    return row;
  }

  function renderPrimary(saved) {
    const host = $("#nw-primary-row");
    host.innerHTML = "";
    const row = createPropertyCardFromTemplate(true, saved);
    if (!saved)
      (row.querySelector('[data-field="label"]') || {}).value = "自住房";
    host.appendChild(row);
    recalc();
  }

  function createInvestmentProperty(saved) {
    const id =
      saved && typeof saved === "object" && saved.id ? saved.id : `p-${propSeq++}`;
    bumpSeqFromId("p", id);
    return {
      id,
      label: (saved && saved.label) || `投资房${investmentProperties.length + 1}`,
      purchasePrice: (saved && saved.purchasePrice) || "",
      downPayMode: (saved && saved.downPayMode) || "amount",
      downPayment: (saved && saved.downPayment) || "",
      annualRate: (saved && saved.annualRate) || "",
      loanYears: (saved && saved.loanYears) || "30",
      purchaseYm: (saved && saved.purchaseYm) || "",
      currentValue: (saved && saved.currentValue) || "",
      legacyRemaining: (saved && saved.legacyRemaining) || "",
    };
  }

  function addPropertyRow(saved) {
    investmentProperties.push(createInvestmentProperty(saved));
    renderInvestmentMatrix();
    updateInvEmpty();
    recalc();
  }

  function renderInvestmentMatrix() {
    const list = $("#nw-investment-list");
    const heads = $("#nw-invest-col-heads");
    if (!list || !heads) return;
    const cols = Math.max(1, investmentProperties.length);
    heads.style.setProperty("--cols", String(cols));
    list.innerHTML = "";
    heads.innerHTML = investmentProperties
      .map(
        (p, i) =>
          `<div class="nw-invest-col-head" data-property-id="${p.id}">
            <span class="nw-invest-col-no">${i + 1}</span>
            <input type="text" class="nw-inp-label nw-invest-col-title" data-prop-key="label" value="${escapeHtml(
              p.label || ""
            )}" spellcheck="false" />
            <button type="button" class="nw-btn-remove" data-action="remove-col" title="移除此套">×</button>
          </div>`
      )
      .join("");

    const rows = [
      { key: "purchasePrice", label: "购房价", type: "money" },
      { key: "downPayment", label: "首付", type: "down" },
      { key: "annualRate", label: "年利率 %" },
      { key: "loanYears", label: "贷款年限" },
      { key: "purchaseYm", label: "购买年月", type: "month" },
      { key: "currentValue", label: "目前估值", type: "money" },
      { key: "principal", label: "贷款本金", computed: true },
      { key: "remaining", label: "剩余房贷", computed: true },
      { key: "equity", label: "净值", computed: true },
    ];

    rows.forEach((r) => {
      const row = document.createElement("div");
      row.className = "nw-invest-row";
      row.style.setProperty("--cols", String(cols));
      row.innerHTML = `<div class="nw-invest-row-label">${r.label}</div>`;
      investmentProperties.forEach((p) => {
        const cell = document.createElement("div");
        if (r.computed) {
          const n = computePropertyNumbersFromValues(p);
          const val =
            r.key === "principal"
              ? formatCurrency(n.principal)
              : r.key === "remaining"
              ? formatCurrency(n.remaining)
              : formatCurrencySigned(n.equity);
          cell.className = "nw-invest-cell-computed";
          cell.setAttribute("data-comp-key", r.key);
          cell.setAttribute("data-prop-id", p.id);
          if (r.key === "equity" && n.equity < 0) cell.classList.add("negative");
          cell.textContent = val;
        } else if (r.key === "downPayment") {
          const mode = p.downPayMode === "percent" ? "percent" : "amount";
          const inpVal = mode === "percent" ? stripCurrencyText(p.downPayment) : formatInputCurrency(p.downPayment);
          cell.innerHTML = `<div class="nw-invest-downpay-cell"><select data-prop-id="${p.id}" data-prop-key="downPayMode" class="nw-downpay-mode"><option value="amount"${
            mode === "amount" ? " selected" : ""
          }>金额</option><option value="percent"${
            mode === "percent" ? " selected" : ""
          }>比例 %</option></select><input type="text" class="nw-inp-num" data-prop-id="${p.id}" data-prop-key="downPayment" value="${escapeHtml(
            inpVal
          )}" inputmode="decimal" placeholder="${mode === "percent" ? "如 25" : "$0"}" /></div>`;
        } else {
          const value = p[r.key] || "";
          const inputType = r.type === "month" ? "month" : "text";
          const display =
            r.type === "money"
              ? formatInputCurrency(value)
              : value;
          cell.innerHTML = `<input type="${inputType}" class="nw-inp-num" data-prop-id="${p.id}" data-prop-key="${r.key}" value="${escapeHtml(
            display
          )}" ${r.type === "month" ? "" : 'inputmode="decimal"'} />`;
        }
        row.appendChild(cell);
      });
      list.appendChild(row);
    });
  }

  function refreshInvestmentComputedDisplays() {
    const list = $("#nw-investment-list");
    if (!list) return;
    list.querySelectorAll("[data-comp-key][data-prop-id]").forEach((el) => {
      const key = el.getAttribute("data-comp-key");
      const pid = el.getAttribute("data-prop-id");
      const p = investmentProperties.find((x) => x.id === pid);
      if (!p) return;
      const n = computePropertyNumbersFromValues(p);
      if (key === "principal") el.textContent = formatCurrency(n.principal);
      else if (key === "remaining") el.textContent = formatCurrency(n.remaining);
      else if (key === "equity") {
        el.textContent = formatCurrencySigned(n.equity);
        el.classList.toggle("negative", n.equity < 0);
      }
    });
  }

  function addAssetRow(labelDefault, saved) {
    const tpl = $("#tpl-nw-asset");
    const node = tpl.content.cloneNode(true);
    const row = node.querySelector(".nw-asset-row");
    const id =
      saved && saved.id ? saved.id : `a-${assetSeq++}`;
    row.dataset.assetId = id;
    bumpSeqFromId("a", id);
    const labInp = row.querySelector('[data-field="label"]');
    if (saved && typeof saved === "object") {
      if (saved.label != null) labInp.value = saved.label;
    } else if (labelDefault) {
      labInp.value = labelDefault;
    }
    $("#nw-assets-list").appendChild(node);
    const amountsWrap = row.querySelector("[data-person-amounts]");
    people.forEach((p) => {
      const inp = document.createElement("input");
      inp.type = "text";
      inp.className = "nw-inp-num nw-mat-person-input";
      inp.dataset.personId = p.id;
      inp.placeholder = "$0";
      inp.inputMode = "decimal";
      if (saved && saved.amounts && saved.amounts[p.id] != null) {
        inp.value = formatInputCurrency(saved.amounts[p.id]);
      }
      inp.addEventListener("input", () => {
        updateAssetRowTotal(row);
        renderAssetsFooter();
        recalc();
      });
      bindMoneyInput(inp, recalc);
      amountsWrap.appendChild(inp);
    });
    labInp.addEventListener("input", recalc);
    updateAssetRowTotal(row);
    row.querySelector("[data-action=remove]").addEventListener("click", () => {
      row.remove();
      renderAssetsFooter();
      recalc();
    });
    renderAssetsFooter();
    recalc();
  }

  function addLiabilityRow(labelDefault, saved) {
    const tpl = $("#tpl-nw-liability");
    const node = tpl.content.cloneNode(true);
    const row = node.querySelector(".nw-liab-row");
    const id = saved && saved.id ? saved.id : `l-${liabSeq++}`;
    row.dataset.liabilityId = id;
    bumpSeqFromId("l", id);
    const labInp = row.querySelector('[data-field="label"]');
    const amtInp = row.querySelector('[data-field="amount"]');
    if (saved && typeof saved === "object") {
      if (saved.label != null) labInp.value = saved.label;
      if (saved.amount != null) amtInp.value = formatInputCurrency(saved.amount);
    } else if (labelDefault) {
      labInp.value = labelDefault;
    }
    $("#nw-liabilities-list").appendChild(node);
    row.querySelector(".nw-liab-drag-handle")?.setAttribute("draggable", "true");
    labInp.addEventListener("input", recalc);
    amtInp.addEventListener("input", recalc);
    bindMoneyInput(amtInp, recalc);
    row.querySelector("[data-action=remove]").addEventListener("click", () => {
      row.remove();
      recalc();
    });
    recalc();
  }

  function updateInvEmpty() {
    const empty = $("#nw-inv-empty");
    if (!empty) return;
    empty.hidden = investmentProperties.length > 0;
  }

  function migrateV1(old) {
    const peopleMig = [{ id: "u-0", name: "成员1" }];
    bumpSeqFromId("u", "u-0");
    const assets = Array.isArray(old.assets)
      ? old.assets.map((a) => ({
          id: a.id,
          label: a.label || "",
          amounts: { "u-0": a.amount != null ? a.amount : "" },
        }))
      : [];

    let primary = null;
    if (old.primary && typeof old.primary === "object") {
      const p = old.primary;
      primary = {
        label: p.label || "",
        purchasePrice: p.value || "",
        downPayMode: "amount",
        downPayment: "",
        annualRate: "",
        loanYears: "30",
        purchaseYm: "",
        currentValue: p.value || "",
        legacyRemaining: p.mortgage != null && p.mortgage !== "" ? p.mortgage : undefined,
      };
    }

    const properties = Array.isArray(old.properties)
      ? old.properties.map((p) => ({
          id: p.id,
          label: p.label || "",
          purchasePrice: p.value || "",
          downPayMode: "amount",
          downPayment: "",
          annualRate: "",
          loanYears: "30",
          purchaseYm: "",
          currentValue: p.value || "",
          legacyRemaining: p.mortgage != null && p.mortgage !== "" ? p.mortgage : undefined,
        }))
      : [];

    return {
      version: 2,
      people: peopleMig,
      primary,
      properties,
      assets,
      liabilities: old.liabilities || [],
    };
  }

  function seedDefaults() {
    people = [{ id: "u-0", name: "成员1" }];
    personSeq = 1;
    renderPeopleHeader();
    DEFAULT_ASSETS.forEach((label) => addAssetRow(label, null));
    DEFAULT_LIABILITIES.forEach((label) => addLiabilityRow(label, null));
  }

  function restore() {
    let data = null;
    try {
      const rawV2 = localStorage.getItem(STORAGE_KEY_V2);
      if (rawV2) {
        data = JSON.parse(rawV2);
      } else {
        const rawV1 = localStorage.getItem(STORAGE_KEY_V1);
        if (rawV1) data = migrateV1(JSON.parse(rawV1));
      }
    } catch (_) {}

    propSeq = 0;
    assetSeq = 0;
    liabSeq = 0;
    personSeq = 0;
    people = [];
    investmentProperties = [];

    if (!data || typeof data !== "object") {
      seedDefaults();
      renderPrimary(null);
      renderInvestmentMatrix();
      updateInvEmpty();
      recalc();
      return;
    }

    hydrateFromData(data);
  }

  function getDragAfterElement(container, y, rowSelector, draggingClass) {
    const rows = [
      ...container.querySelectorAll(`${rowSelector}:not(.${draggingClass})`),
    ];
    return rows.reduce(
      (closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
          return { offset, element: child };
        }
        return closest;
      },
      { offset: Number.NEGATIVE_INFINITY, element: null }
    ).element;
  }

  function initAssetDragSort() {
    const list = $("#nw-assets-list");
    if (!list || list.dataset.assetDragBound === "1") return;
    list.dataset.assetDragBound = "1";

    list.addEventListener("dragstart", (e) => {
      const handle = e.target.closest(".nw-asset-drag-handle");
      if (!handle || !list.contains(handle)) return;
      const row = handle.closest(".nw-asset-row");
      if (!row) return;
      row.classList.add("nw-asset-row--dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", row.dataset.assetId || "");
    });

    list.addEventListener("dragend", () => {
      list.querySelectorAll(".nw-asset-row--dragging").forEach((r) => {
        r.classList.remove("nw-asset-row--dragging");
      });
      recalc();
    });

    list.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const dragging = list.querySelector(".nw-asset-row--dragging");
      if (!dragging) return;
      const after = getDragAfterElement(
        list,
        e.clientY,
        ".nw-asset-row",
        "nw-asset-row--dragging"
      );
      if (after == null) {
        list.appendChild(dragging);
      } else {
        list.insertBefore(dragging, after);
      }
    });

    list.addEventListener("drop", (e) => {
      e.preventDefault();
    });
  }

  function initLiabilityDragSort() {
    const list = $("#nw-liabilities-list");
    if (!list || list.dataset.liabDragBound === "1") return;
    list.dataset.liabDragBound = "1";

    list.addEventListener("dragstart", (e) => {
      const handle = e.target.closest(".nw-liab-drag-handle");
      if (!handle || !list.contains(handle)) return;
      const row = handle.closest(".nw-liab-row");
      if (!row) return;
      row.classList.add("nw-liab-row--dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", row.dataset.liabilityId || "");
    });

    list.addEventListener("dragend", () => {
      list.querySelectorAll(".nw-liab-row--dragging").forEach((r) => {
        r.classList.remove("nw-liab-row--dragging");
      });
      recalc();
    });

    list.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const dragging = list.querySelector(".nw-liab-row--dragging");
      if (!dragging) return;
      const after = getDragAfterElement(
        list,
        e.clientY,
        ".nw-liab-row",
        "nw-liab-row--dragging"
      );
      if (after == null) list.appendChild(dragging);
      else list.insertBefore(dragging, after);
    });

    list.addEventListener("drop", (e) => {
      e.preventDefault();
    });
  }

  function bind() {
    $("#nw-btn-add-property").addEventListener("click", () => addPropertyRow(null));
    $("#nw-btn-add-asset").addEventListener("click", () => addAssetRow("", null));
    $("#nw-btn-add-liability").addEventListener("click", () => addLiabilityRow("", null));
    $("#nw-btn-add-person").addEventListener("click", () => addPerson(null));
    $("#nw-invest-col-heads").addEventListener("input", (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement)) return;
      const head = t.closest("[data-property-id]");
      if (!head) return;
      const pid = head.getAttribute("data-property-id");
      const prop = investmentProperties.find((x) => x.id === pid);
      if (!prop) return;
      prop.label = t.value;
      recalc();
    });
    $("#nw-invest-col-heads").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action='remove-col']");
      if (!btn) return;
      const head = btn.closest("[data-property-id]");
      if (!head) return;
      const pid = head.getAttribute("data-property-id");
      investmentProperties = investmentProperties.filter((x) => x.id !== pid);
      renderInvestmentMatrix();
      updateInvEmpty();
      recalc();
    });
    $("#nw-investment-list").addEventListener("input", (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const pid = t.getAttribute("data-prop-id");
      const key = t.getAttribute("data-prop-key");
      if (!pid || !key) return;
      const prop = investmentProperties.find((x) => x.id === pid);
      if (!prop) return;
      prop[key] = t.value;
      if (
        new Set([
          "purchasePrice",
          "downPayment",
          "downPayMode",
          "annualRate",
          "loanYears",
          "purchaseYm",
        ]).has(key)
      ) {
        prop.legacyRemaining = "";
      }
      recalc();
    });
    $("#nw-investment-list").addEventListener("change", (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const pid = t.getAttribute("data-prop-id");
      const key = t.getAttribute("data-prop-key");
      if (!pid || !key) return;
      const prop = investmentProperties.find((x) => x.id === pid);
      if (!prop) return;
      prop[key] = t.value;
      if (key === "downPayMode") {
        if (prop.downPayMode !== "percent") prop.downPayment = formatInputCurrency(prop.downPayment);
        else prop.downPayment = stripCurrencyText(prop.downPayment);
        renderInvestmentMatrix();
      }
      recalc();
    });
    $("#nw-investment-list").addEventListener("focusin", (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement)) return;
      const key = t.getAttribute("data-prop-key");
      if (key === "purchasePrice" || key === "currentValue") t.value = stripCurrencyText(t.value);
      if (key === "downPayment") {
        const pid = t.getAttribute("data-prop-id");
        const prop = investmentProperties.find((x) => x.id === pid);
        if (!prop || prop.downPayMode !== "percent") t.value = stripCurrencyText(t.value);
      }
    });
    $("#nw-investment-list").addEventListener("focusout", (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement)) return;
      const pid = t.getAttribute("data-prop-id");
      const key = t.getAttribute("data-prop-key");
      if (!pid || !key) return;
      const prop = investmentProperties.find((x) => x.id === pid);
      if (!prop) return;
      if (key === "purchasePrice" || key === "currentValue") {
        prop[key] = formatInputCurrency(t.value);
        t.value = prop[key];
      }
      if (key === "downPayment" && prop.downPayMode !== "percent") {
        prop.downPayment = formatInputCurrency(t.value);
        t.value = prop.downPayment;
      }
      recalc();
    });

    initAssetDragSort();
    initLiabilityDragSort();

    const btnSn = $("#nw-scenario-save-new");
    const btnLoad = $("#nw-scenario-load");
    const btnOw = $("#nw-scenario-overwrite");
    const btnDel = $("#nw-scenario-delete");
    if (btnSn) btnSn.addEventListener("click", saveNewScenarioFromPrompt);
    if (btnLoad) btnLoad.addEventListener("click", loadSelectedScenario);
    if (btnOw) btnOw.addEventListener("click", overwriteSelectedScenario);
    if (btnDel) btnDel.addEventListener("click", deleteSelectedScenario);

    $("#nw-btn-reset").addEventListener("click", () => {
      if (!confirm("确定清空净资产表全部数据？（将恢复默认科目与一名成员）")) return;
      try {
        localStorage.removeItem(STORAGE_KEY_V2);
        localStorage.removeItem(STORAGE_KEY_V1);
      } catch (_) {}
      propSeq = 0;
      assetSeq = 0;
      liabSeq = 0;
      personSeq = 0;
      people = [];
      investmentProperties = [];
      $("#nw-investment-list").innerHTML = "";
      $("#nw-invest-col-heads").innerHTML = "";
      $("#nw-assets-list").innerHTML = "";
      $("#nw-liabilities-list").innerHTML = "";
      seedDefaults();
      renderPrimary(null);
      renderInvestmentMatrix();
      updateInvEmpty();
      recalc();
    });
  }

  bind();
  restore();
  refreshScenarioSelectOptions();
})();
