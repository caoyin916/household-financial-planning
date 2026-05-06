(function () {
  "use strict";

  const STORAGE_KEY = "household-pl-estimate-v3";
  const LABEL_STORAGE_KEY = "household-pl-labels-v1";
  const CF_SCENARIOS_KEY = "household-pl-cashflow-scenarios-v1";
  const BIWEEKLY_PER_YEAR = 26;
  const MGMT_RATE = 0.08;

  const $ = (sel, root = document) => root.querySelector(sel);

  function getLabelDefaults() {
    return typeof window !== "undefined" && window.HOUSEHOLD_LABEL_DEFAULTS
      ? window.HOUSEHOLD_LABEL_DEFAULTS
      : {};
  }

  function loadLabelsMerged() {
    const base = { ...getLabelDefaults() };
    try {
      const raw = localStorage.getItem(LABEL_STORAGE_KEY);
      if (raw) return { ...base, ...JSON.parse(raw) };
    } catch (_) {}
    return base;
  }

  function saveLabelsMerged(merged) {
    try {
      localStorage.setItem(LABEL_STORAGE_KEY, JSON.stringify(merged));
    } catch (_) {}
  }

  function applyCmtPlaceholders(merged) {
    const ph = merged.lbl_ph_cmt != null ? merged.lbl_ph_cmt : "备注";
    document.querySelectorAll(".input-cmt[data-cmt-ph]").forEach((el) => {
      el.placeholder = ph;
    });
    const titlePh = merged.lbl_rent_title_ph != null ? merged.lbl_rent_title_ph : "";
    document.querySelectorAll('[data-rental-field="label"]').forEach((el) => {
      el.placeholder = titlePh;
    });
  }

  function syncRowNameTitles() {
    document.querySelectorAll(".input-label-name").forEach((inp) => {
      inp.title = inp.value || "";
    });
  }

  function applyLabelsToDom() {
    const merged = loadLabelsMerged();
    document.querySelectorAll("[data-label-id]").forEach((el) => {
      const key = el.dataset.labelId;
      if (merged[key] === undefined) return;
      const v = merged[key];
      if (el.tagName === "TEXTAREA") el.value = v;
      else el.value = v;
    });
    applyCmtPlaceholders(merged);
    syncRowNameTitles();
  }

  function initLabelBindings() {
    document.addEventListener(
      "input",
      (e) => {
        const t = e.target;
        if (!(t instanceof HTMLElement)) return;
        const id = t.dataset.labelId;
        if (!id) return;
        const merged = loadLabelsMerged();
        merged[id] = t.value;
        saveLabelsMerged(merged);
        document.querySelectorAll(`[data-label-id="${id}"]`).forEach((el) => {
          if (el !== t) el.value = merged[id];
        });
        if (id === "lbl_ph_cmt" || id === "lbl_rent_title_ph") {
          applyCmtPlaceholders(merged);
        }
        if (t.classList && t.classList.contains("input-label-name")) {
          syncRowNameTitles();
        }
      },
      true
    );
  }

  function stripMoney(raw) {
    return String(raw ?? "")
      .replace(/\u2212/g, "-")
      .replace(/[$,\s]/g, "");
  }

  /** 允许负数（副业 / 自雇净额等）：去掉货币符号与千分位后解析 */
  function parseNumSigned(el) {
    if (!el) return 0;
    const v = parseFloat(stripMoney(el.value));
    return Number.isFinite(v) ? v : 0;
  }

  function parseNum(el) {
    if (!el) return 0;
    const v = parseFloat(stripMoney(el.value));
    return Number.isFinite(v) && v >= 0 ? v : 0;
  }

  function parseVacancyMonths(el) {
    if (!el) return 1;
    const raw = String(el.value).trim();
    if (raw === "") return 1;
    const v = parseInt(raw, 10);
    if (!Number.isFinite(v)) return 1;
    return Math.min(12, Math.max(0, v));
  }

  function formatMoneyAbs(n) {
    return Math.round(Math.abs(n)).toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }

  /** 展示用：正数为 $1,234；负数为 −$1,234（用于可同时为正负的汇总） */
  function formatMoney(n) {
    if (!Number.isFinite(n)) return "—";
    const core = formatMoneyAbs(n);
    return n < 0 ? `-$${core}` : `$${core}`;
  }

  function formatInputCurrency(raw) {
    const clean = stripMoney(raw);
    if (clean === "") return "";
    const v = parseFloat(clean);
    if (!Number.isFinite(v) || v < 0) return "";
    return `$${formatMoneyAbs(v)}`;
  }

  function formatInputCurrencySigned(raw) {
    const clean = stripMoney(raw);
    if (clean === "" || clean === "-") return "";
    const neg = /^-/.test(clean);
    const v = parseFloat(neg ? clean.slice(1) : clean);
    if (!Number.isFinite(v)) return "";
    const core = formatMoneyAbs(v);
    return neg ? `-$${core}` : `$${core}`;
  }

  function formatAllMoneyInputsVisually() {
    document.querySelectorAll(".input-money").forEach((el) => {
      if (!(el instanceof HTMLInputElement)) return;
      if (el.dataset.moneySigned === "true") {
        el.value = formatInputCurrencySigned(el.value);
      } else {
        el.value = formatInputCurrency(el.value);
      }
    });
  }

  function bindMoneyInputFormatting() {
    document.addEventListener(
      "focusin",
      (e) => {
        const t = e.target;
        if (!(t instanceof HTMLInputElement) || !t.classList.contains("input-money")) return;
        t.value = stripMoney(t.value);
      },
      true
    );
    document.addEventListener(
      "focusout",
      (e) => {
        const t = e.target;
        if (!(t instanceof HTMLInputElement) || !t.classList.contains("input-money")) return;
        if (t.dataset.moneySigned === "true") {
          t.value = formatInputCurrencySigned(t.value);
        } else {
          t.value = formatInputCurrency(t.value);
        }
        recalc();
      },
      true
    );
  }

  function annualFromBiweekly(x) {
    return x * BIWEEKLY_PER_YEAR;
  }

  function annualFromMonthly(x) {
    return x * 12;
  }

  function collectRentalCards() {
    return Array.from(document.querySelectorAll(".rental-card"));
  }

  function rentalDerived(card) {
    const R = parseNum(card.querySelector('[data-rental-field="rent"]'));
    const V = parseVacancyMonths(card.querySelector('[data-rental-field="vacancyMonths"]'));
    const collectedAnnual = (12 - V) * R;
    const managementFee = MGMT_RATE * collectedAnnual;
    const vacancyLoss = V * R;
    return { R, V, collectedAnnual, managementFee, vacancyLoss };
  }

  function getRentIncomeAnnualFromCards() {
    let sum = 0;
    collectRentalCards().forEach((card) => {
      const R = parseNum(card.querySelector('[data-rental-field="rent"]'));
      sum += annualFromMonthly(R);
    });
    return sum;
  }

  function rentalExpenseAnnual(card) {
    const m = (field) => {
      const el = card.querySelector(`[data-rental-field="${field}"]`);
      return parseNum(el);
    };
    const { managementFee, vacancyLoss } = rentalDerived(card);
    const mortgage = annualFromMonthly(m("mortgage"));
    const insurance = m("insurance");
    const propertyTax = m("propertyTax");
    const repair = annualFromMonthly(m("repair"));
    const hoa = annualFromMonthly(m("hoa"));
    return (
      mortgage +
      insurance +
      propertyTax +
      repair +
      hoa +
      vacancyLoss +
      managementFee
    );
  }

  function rentalGrossAnnual(card) {
    const R = parseNum(card.querySelector('[data-rental-field="rent"]'));
    return annualFromMonthly(R);
  }

  function getRentalsAnnual() {
    let sum = 0;
    const items = [];
    collectRentalCards().forEach((card, i) => {
      const labelInput = card.querySelector('[data-rental-field="label"]');
      const label =
        (labelInput && labelInput.value.trim()) || `出租物业 ${i + 1}`;
      const gross = rentalGrossAnnual(card);
      const cost = rentalExpenseAnnual(card);
      const { managementFee } = rentalDerived(card);
      const net = gross - cost;
      sum += cost;
      items.push({
        rentalId: card.dataset.rentalId || "",
        label,
        amount: cost,
        gross,
        managementFee,
        net,
      });
    });
    return { total: sum, items };
  }

  function getFixedExpenseAnnual() {
    return (
      annualFromMonthly(parseNum($("#ex-primary-mortgage"))) +
      parseNum($("#ex-primary-property-tax")) +
      parseNum($("#ex-home-ins")) +
      annualFromMonthly(parseNum($("#ex-primary-home-repair"))) +
      annualFromMonthly(parseNum($("#ex-primary-hoa"))) +
      annualFromMonthly(parseNum($("#ex-auto-loan"))) +
      parseNum($("#ex-auto-ins")) +
      annualFromMonthly(parseNum($("#ex-water-trash"))) +
      annualFromMonthly(parseNum($("#ex-electric"))) +
      annualFromMonthly(parseNum($("#ex-phone"))) +
      annualFromMonthly(parseNum($("#ex-transport"))) +
      annualFromMonthly(parseNum($("#ex-education"))) +
      annualFromMonthly(parseNum($("#ex-kids-others"))) +
      annualFromMonthly(parseNum($("#ex-subs"))) +
      annualFromMonthly(parseNum($("#ex-food"))) +
      annualFromMonthly(parseNum($("#ex-travel"))) +
      annualFromMonthly(parseNum($("#ex-shopping"))) +
      parseNum($("#ex-tax-annual")) +
      parseNum($("#ex-other-annual"))
    );
  }

  function getIncomeAnnual() {
    const salary = annualFromBiweekly(parseNum($("#inc-salary-biweekly")));
    const bonus = parseNum($("#inc-bonus-annual"));
    const side = parseNumSigned($("#inc-side-annual"));
    const rsu = parseNum($("#inc-rsu-annual"));
    const rent = getRentIncomeAnnualFromCards();
    const dcfsa = parseNum($("#inc-dcfsa-annual"));
    const ret401kPre = parseNum($("#inc-ret-401k-pre-match"));
    const ret401kAfter = parseNum($("#inc-ret-401k-after"));
    const hsa = parseNum($("#inc-hsa-annual"));
    const retirementExcludedAnnual = ret401kPre + ret401kAfter + hsa;
    const total =
      salary +
      bonus +
      side +
      rsu +
      rent +
      dcfsa +
      ret401kPre +
      ret401kAfter +
      hsa;
    return {
      total,
      salary,
      bonus,
      side,
      rsu,
      rent,
      dcfsa,
      ret401kPre,
      ret401kAfter,
      hsa,
      retirementExcludedAnnual,
    };
  }

  function updateRentalDerivedDisplays() {
    collectRentalCards().forEach((card) => {
      const mgEl = card.querySelector("[data-rental-mgmt]");
      const p = card.querySelector("[data-rental-computed]");
      const netEl = card.querySelector("[data-rental-net]");
      const { R, collectedAnnual, managementFee, vacancyLoss } = rentalDerived(card);
      const gross = rentalGrossAnnual(card);
      const cost = rentalExpenseAnnual(card);
      const net = gross - cost;

      if (mgEl) {
        mgEl.textContent = R > 0 ? formatMoney(managementFee) : "—";
      }

      if (p) {
        if (R > 0) {
          p.hidden = false;
          p.textContent = `年化实收租金 ${formatMoney(collectedAnnual)}（满额年租 ${formatMoney(annualFromMonthly(R))}）；空置损失 ${formatMoney(vacancyLoss)}；其余成本含房贷/税/HOA/维修等见上表`;
        } else {
          p.textContent = "";
          p.hidden = true;
        }
      }

      if (netEl) {
        if (R > 0 || cost > 0) {
          netEl.hidden = false;
          netEl.textContent = `该套净现金流（年）： ${net >= 0 ? "+" : ""}${formatMoney(net)}（满额年租 ${formatMoney(gross)} − 总成本 ${formatMoney(cost)}）`;
          netEl.classList.toggle("negative", net < 0);
        } else {
          netEl.textContent = "";
          netEl.hidden = true;
        }
      }
    });
  }

  function snapshotBreakdownFocus() {
    const a = document.activeElement;
    if (!a || !(a instanceof HTMLInputElement)) return null;
    if (a.classList.contains("bd-rental-name") && a.dataset.rentalId) {
      return {
        kind: "rental",
        id: a.dataset.rentalId,
        start: a.selectionStart,
        end: a.selectionEnd,
      };
    }
    if (a.classList.contains("breakdown-name-input") && a.dataset.labelId) {
      return {
        kind: "label",
        id: a.dataset.labelId,
        start: a.selectionStart,
        end: a.selectionEnd,
      };
    }
    return null;
  }

  function restoreBreakdownFocus(snap) {
    if (!snap) return;
    requestAnimationFrame(() => {
      let el = null;
      if (snap.kind === "rental") {
        el = document.querySelector(
          `#bd-expense-rentals .bd-rental-name[data-rental-id="${snap.id}"]`
        );
      } else {
        el = document.querySelector(
          `.breakdown-name-input[data-label-id="${snap.id}"]`
        );
      }
      if (!el || !(el instanceof HTMLInputElement)) return;
      el.focus();
      try {
        if (snap.start != null && snap.end != null) {
          el.setSelectionRange(snap.start, snap.end);
        }
      } catch (_) {}
    });
  }

  function recalc() {
    const bdFocus = snapshotBreakdownFocus();
    const inc = getIncomeAnnual();
    const fixedEx = getFixedExpenseAnnual();
    const rentals = getRentalsAnnual();
    const expenseTotal = fixedEx + rentals.total;
    const totalFlow = inc.total - expenseTotal;
    const spendableIncome = inc.total - inc.retirementExcludedAnnual;
    const spendableFlow = spendableIncome - expenseTotal;

    $("#out-annual-income").textContent = formatMoney(inc.total);
    $("#out-annual-expense").textContent = formatMoney(expenseTotal);

    const elTotal = $("#out-total-flow");
    elTotal.textContent = (totalFlow >= 0 ? "+" : "") + formatMoney(totalFlow);
    elTotal.classList.remove("positive", "negative");
    elTotal.classList.add(totalFlow >= 0 ? "positive" : "negative");

    const elSp = $("#out-spendable-flow");
    elSp.textContent = (spendableFlow >= 0 ? "+" : "") + formatMoney(spendableFlow);
    elSp.classList.remove("positive", "negative");
    elSp.classList.add(spendableFlow >= 0 ? "positive" : "negative");

    $("#out-monthly-total").textContent =
      (totalFlow / 12 >= 0 ? "+" : "") + formatMoney(totalFlow / 12);
    $("#out-monthly-spendable").textContent =
      (spendableFlow / 12 >= 0 ? "+" : "") + formatMoney(spendableFlow / 12);

    const bdIn = $("#bd-income");
    const incomeRows = [
      ["lbl_bd_inc_salary", inc.salary],
      ["lbl_bd_inc_bonus", inc.bonus],
      ["lbl_bd_inc_side", inc.side],
      ["lbl_bd_inc_rsu", inc.rsu],
      ["lbl_bd_inc_rent", inc.rent],
      ["lbl_bd_inc_dcfsa", inc.dcfsa],
      ["lbl_bd_inc_401kpre", inc.ret401kPre],
      ["lbl_bd_inc_401kaft", inc.ret401kAfter],
      ["lbl_bd_inc_hsa", inc.hsa],
    ];
    bdIn.innerHTML = incomeRows
      .filter(([, v]) => v !== 0)
      .map(
        ([labelId, v]) =>
          `<li><input type="text" class="breakdown-name-input" data-label-id="${labelId}" spellcheck="false" /><span class="amt">${formatMoney(
            v
          )}</span></li>`
      )
      .join("");
    if (!bdIn.innerHTML) {
      bdIn.innerHTML = `<li><input type="text" class="breakdown-name-input" data-label-id="lbl_bd_empty_income" spellcheck="false" /><span class="amt">${formatMoney(
        0
      )}</span></li>`;
    }

    const bdFix = $("#bd-expense-fixed");
    const parts = [
      ["lbl_bd_ex_mort", annualFromMonthly(parseNum($("#ex-primary-mortgage")))],
      ["lbl_bd_ex_primary_ptax", parseNum($("#ex-primary-property-tax"))],
      ["lbl_bd_ex_hi", parseNum($("#ex-home-ins"))],
      ["lbl_bd_ex_homerep", annualFromMonthly(parseNum($("#ex-primary-home-repair")))],
      ["lbl_bd_ex_phoa", annualFromMonthly(parseNum($("#ex-primary-hoa")))],
      ["lbl_bd_ex_autoloan", annualFromMonthly(parseNum($("#ex-auto-loan")))],
      ["lbl_bd_ex_autoins", parseNum($("#ex-auto-ins"))],
      ["lbl_bd_ex_water", annualFromMonthly(parseNum($("#ex-water-trash")))],
      ["lbl_bd_ex_elec", annualFromMonthly(parseNum($("#ex-electric")))],
      ["lbl_bd_ex_phone", annualFromMonthly(parseNum($("#ex-phone")))],
      ["lbl_bd_ex_transport", annualFromMonthly(parseNum($("#ex-transport")))],
      ["lbl_bd_ex_ed", annualFromMonthly(parseNum($("#ex-education")))],
      ["lbl_bd_ex_kids", annualFromMonthly(parseNum($("#ex-kids-others")))],
      ["lbl_bd_ex_subs", annualFromMonthly(parseNum($("#ex-subs")))],
      ["lbl_bd_ex_food", annualFromMonthly(parseNum($("#ex-food")))],
      ["lbl_bd_ex_travel", annualFromMonthly(parseNum($("#ex-travel")))],
      ["lbl_bd_ex_shop", annualFromMonthly(parseNum($("#ex-shopping")))],
      ["lbl_bd_ex_tax", parseNum($("#ex-tax-annual"))],
      ["lbl_bd_ex_other", parseNum($("#ex-other-annual"))],
    ];
    bdFix.innerHTML = parts
      .filter(([, v]) => v > 0)
      .map(
        ([labelId, v]) =>
          `<li><input type="text" class="breakdown-name-input" data-label-id="${labelId}" spellcheck="false" /><span class="amt">${formatMoney(
            v
          )}</span></li>`
      )
      .join("");
    if (!bdFix.innerHTML) {
      bdFix.innerHTML = `<li><input type="text" class="breakdown-name-input" data-label-id="lbl_bd_empty_fixed" spellcheck="false" /><span class="amt">—</span></li>`;
    }

    const bdRent = $("#bd-expense-rentals");
    if (rentals.items.length === 0) {
      bdRent.innerHTML = `<li><input type="text" class="breakdown-name-input" data-label-id="lbl_bd_rental_none" spellcheck="false" /><span class="amt">${formatMoney(
        0
      )}</span></li>`;
    } else {
      bdRent.innerHTML = rentals.items
        .map((x) => {
          const sub = `成本 ${formatMoney(x.amount)} · 管理费 ${formatMoney(x.managementFee)} · 净 ${formatMoney(x.net)}`;
          const rid = escapeHtml(x.rentalId || "");
          return `<li><input type="text" class="breakdown-name-input bd-rental-name" data-rental-id="${rid}" value="${escapeHtml(x.label)}" spellcheck="false" /><span class="amt">${escapeHtml(
            sub
          )}</span></li>`;
        })
        .join("");
    }

    applyLabelsToDom();
    restoreBreakdownFocus(bdFocus);

    updateRentalDerivedDisplays();
    persist();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  let rentalSeq = 0;

  const RENTAL_PERSIST_FIELDS = [
    "rent",
    "vacancyMonths",
    "mortgage",
    "insurance",
    "propertyTax",
    "repair",
    "hoa",
  ];

  const RENTAL_CMT_FIELDS = RENTAL_PERSIST_FIELDS.slice();

  function addRentalCard(saved) {
    const tpl = $("#tpl-rental");
    const node = tpl.content.cloneNode(true);
    const card = node.querySelector(".rental-card");
    const id = `rp-${rentalSeq++}`;
    card.dataset.rentalId = id;

    $("#rental-list").appendChild(node);
    const inserted = $(`[data-rental-id="${id}"]`);

    if (saved && typeof saved === "object") {
      const label = inserted.querySelector('[data-rental-field="label"]');
      if (label && saved.label) label.value = saved.label;
      RENTAL_PERSIST_FIELDS.forEach((f) => {
        const el = inserted.querySelector(`[data-rental-field="${f}"]`);
        if (!el) return;
        if (saved[f] != null && saved[f] !== "") el.value = saved[f];
      });
      const vm = inserted.querySelector('[data-rental-field="vacancyMonths"]');
      if (vm && (saved.vacancyMonths == null || saved.vacancyMonths === "")) {
        vm.value = "1";
      }
      if (saved.cmt && typeof saved.cmt === "object") {
        RENTAL_CMT_FIELDS.forEach((f) => {
          const el = inserted.querySelector(`[data-rental-cmt="${f}"]`);
          if (el && saved.cmt[f] != null) el.value = saved.cmt[f];
        });
      }
    }

    inserted.querySelectorAll("input").forEach((inp) => {
      if (inp.dataset.labelId) return;
      inp.addEventListener("input", recalc);
    });
    inserted.querySelector(".btn-remove-rental").addEventListener("click", () => {
      inserted.remove();
      updateRentalEmpty();
      recalc();
    });
    updateRentalEmpty();
    applyLabelsToDom();
    recalc();
  }

  function updateRentalEmpty() {
    const list = $("#rental-list");
    $("#rental-empty").hidden = list.children.length > 0;
  }

  function collectEstimateData() {
    const data = {
      fields: {},
      rentals: [],
    };
    document.querySelectorAll("[data-key]").forEach((el) => {
      data.fields[el.dataset.key] = el.value;
    });
    collectRentalCards().forEach((card) => {
      const o = {
        label: (card.querySelector('[data-rental-field="label"]') || {}).value || "",
        cmt: {},
      };
      RENTAL_PERSIST_FIELDS.forEach((f) => {
        const inp = card.querySelector(`[data-rental-field="${f}"]`);
        o[f] = inp ? inp.value : "";
      });
      RENTAL_CMT_FIELDS.forEach((f) => {
        const el = card.querySelector(`[data-rental-cmt="${f}"]`);
        o.cmt[f] = el ? el.value : "";
      });
      data.rentals.push(o);
    });
    return data;
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(collectEstimateData()));
    } catch (_) {}
  }

  function collectLabelsOverrideRaw() {
    try {
      const raw = localStorage.getItem(LABEL_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function serializeCashflowScenarioSnapshot() {
    return {
      version: 1,
      estimate: collectEstimateData(),
      labelsOverride: collectLabelsOverrideRaw(),
    };
  }

  function loadCfScenariosStore() {
    try {
      const raw = localStorage.getItem(CF_SCENARIOS_KEY);
      if (raw) {
        const o = JSON.parse(raw);
        if (o && Array.isArray(o.scenarios)) return o;
      }
    } catch (_) {}
    return { scenarios: [] };
  }

  function saveCfScenariosStore(store) {
    try {
      localStorage.setItem(CF_SCENARIOS_KEY, JSON.stringify(store));
    } catch (_) {}
  }

  function newCfScenarioId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return `cf-${crypto.randomUUID()}`;
    }
    return `cf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function refreshCfScenarioSelect() {
    const sel = $("#cf-scenario-select");
    if (!sel) return;
    const prev = sel.value;
    const store = loadCfScenariosStore();
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

  function saveNewCfScenarioFromPrompt() {
    const name = window.prompt("为新方案命名（保存当前现金流全部数字、备注与自定义文案）：", "");
    if (name == null) return;
    const trimmed = String(name).trim();
    if (!trimmed) {
      window.alert("请输入方案名称。");
      return;
    }
    const store = loadCfScenariosStore();
    store.scenarios.push({
      id: newCfScenarioId(),
      name: trimmed,
      updatedAt: new Date().toISOString(),
      data: JSON.parse(JSON.stringify(serializeCashflowScenarioSnapshot())),
    });
    saveCfScenariosStore(store);
    refreshCfScenarioSelect();
    const sel = $("#cf-scenario-select");
    if (sel) sel.value = store.scenarios[store.scenarios.length - 1].id;
  }

  function loadCfScenario() {
    const sel = $("#cf-scenario-select");
    if (!sel || !sel.value) {
      window.alert("请先在列表中选择一个已保存方案。");
      return;
    }
    const store = loadCfScenariosStore();
    const s = store.scenarios.find((x) => x.id === sel.value);
    if (!s || !s.data) return;
    applyCashflowScenarioSnapshot(JSON.parse(JSON.stringify(s.data)));
    refreshCfScenarioSelect();
    sel.value = s.id;
  }

  function overwriteCfScenario() {
    const sel = $("#cf-scenario-select");
    if (!sel || !sel.value) {
      window.alert("请先选择要覆盖的方案。");
      return;
    }
    if (!window.confirm("用当前现金流数据覆盖所选方案？")) return;
    const store = loadCfScenariosStore();
    const s = store.scenarios.find((x) => x.id === sel.value);
    if (!s) return;
    s.data = JSON.parse(JSON.stringify(serializeCashflowScenarioSnapshot()));
    s.updatedAt = new Date().toISOString();
    saveCfScenariosStore(store);
    refreshCfScenarioSelect();
    sel.value = s.id;
  }

  function deleteCfScenario() {
    const sel = $("#cf-scenario-select");
    if (!sel || !sel.value) {
      window.alert("请先选择要删除的方案。");
      return;
    }
    if (!window.confirm("确定删除所选方案快照？（当前编辑区不受影响）")) return;
    const store = loadCfScenariosStore();
    store.scenarios = store.scenarios.filter((x) => x.id !== sel.value);
    saveCfScenariosStore(store);
    refreshCfScenarioSelect();
  }

  function applyCashflowScenarioSnapshot(snap) {
    if (!snap || typeof snap !== "object") return;
    const est = snap.estimate;
    if (!est || typeof est !== "object") return;

    if (est.fields && typeof est.fields === "object") {
      document.querySelectorAll("[data-key]").forEach((el) => {
        const k = el.dataset.key;
        if (est.fields[k] != null) el.value = est.fields[k];
      });
      const travelEl = $("#ex-travel");
      const shopEl = $("#ex-shopping");
      if (
        travelEl &&
        shopEl &&
        est.fields.exFun != null &&
        est.fields.exFun !== "" &&
        !est.fields.exTravel &&
        !est.fields.exShopping
      ) {
        travelEl.value = est.fields.exFun;
      }
    }

    $("#rental-list").innerHTML = "";
    if (Array.isArray(est.rentals) && est.rentals.length) {
      est.rentals.forEach((r) => addRentalCard(r));
    }
    updateRentalEmpty();

    try {
      if (snap.labelsOverride && typeof snap.labelsOverride === "object") {
        localStorage.setItem(LABEL_STORAGE_KEY, JSON.stringify(snap.labelsOverride));
      } else {
        localStorage.removeItem(LABEL_STORAGE_KEY);
      }
    } catch (_) {}

    applyLabelsToDom();
    formatAllMoneyInputsVisually();
    recalc();
  }

  function restore() {
    let data = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) data = JSON.parse(raw);
    } catch (_) {}

    if (!data || typeof data !== "object") {
      try {
        const rawV2 = localStorage.getItem("household-pl-estimate-v2");
        if (rawV2) data = JSON.parse(rawV2);
      } catch (_) {}
    }

    if (!data || typeof data !== "object") return;

    if (data.fields && typeof data.fields === "object") {
      document.querySelectorAll("[data-key]").forEach((el) => {
        const k = el.dataset.key;
        if (data.fields[k] != null) el.value = data.fields[k];
      });
      const travelEl = $("#ex-travel");
      const shopEl = $("#ex-shopping");
      if (
        travelEl &&
        shopEl &&
        data.fields.exFun != null &&
        data.fields.exFun !== "" &&
        !data.fields.exTravel &&
        !data.fields.exShopping
      ) {
        travelEl.value = data.fields.exFun;
      }
    }

    $("#rental-list").innerHTML = "";
    if (Array.isArray(data.rentals) && data.rentals.length) {
      data.rentals.forEach((r) => addRentalCard(r));
    }
    updateRentalEmpty();
  }

  function bind() {
    document.addEventListener(
      "input",
      (e) => {
        const t = e.target;
        if (!(t instanceof HTMLInputElement)) return;
        if (!t.classList.contains("bd-rental-name")) return;
        const rid = t.dataset.rentalId;
        if (!rid) return;
        const card = document.querySelector(`.rental-card[data-rental-id="${rid}"]`);
        const labelInp = card?.querySelector('[data-rental-field="label"]');
        if (labelInp) {
          labelInp.value = t.value;
          recalc();
        }
      },
      true
    );

    document.querySelectorAll("[data-key]").forEach((el) => {
      el.addEventListener("input", recalc);
    });
    $("#btn-add-rental").addEventListener("click", () => addRentalCard(null));

    const cfSn = $("#cf-scenario-save-new");
    const cfLd = $("#cf-scenario-load");
    const cfOw = $("#cf-scenario-overwrite");
    const cfDel = $("#cf-scenario-delete");
    if (cfSn) cfSn.addEventListener("click", saveNewCfScenarioFromPrompt);
    if (cfLd) cfLd.addEventListener("click", loadCfScenario);
    if (cfOw) cfOw.addEventListener("click", overwriteCfScenario);
    if (cfDel) cfDel.addEventListener("click", deleteCfScenario);

    $("#btn-reset").addEventListener("click", () => {
      if (!confirm("确定清空所有已填数字、备注与出租物业？（界面标题文案的修改会单独保存，不在此重置。）")) return;
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem("household-pl-estimate-v2");
      document.querySelectorAll("[data-key]").forEach((el) => {
        el.value = "";
      });
      $("#rental-list").innerHTML = "";
      updateRentalEmpty();
      formatAllMoneyInputsVisually();
      recalc();
    });
  }

  initLabelBindings();
  applyLabelsToDom();
  bindMoneyInputFormatting();
  bind();
  restore();
  formatAllMoneyInputsVisually();
  applyLabelsToDom();
  recalc();
  refreshCfScenarioSelect();
})();
