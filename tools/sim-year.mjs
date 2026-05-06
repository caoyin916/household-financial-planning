/**
 * 与 projection.js 中 computeSchedule 同逻辑的一轮模拟，用于在 Node 中查看某年输出。
 * 未读 localStorage；默认用 DEFAULTS，401(k)/Brokerage 初值见下方（可按需改）。
 */
const PROJECTION_YEARS = 50;
const FEDERAL_BRACKETS_MFJ = [
  { cap: 23200, rate: 0.1 },
  { cap: 94300, rate: 0.12 },
  { cap: 201050, rate: 0.22 },
  { cap: 383900, rate: 0.24 },
  { cap: 487450, rate: 0.32 },
  { cap: 731200, rate: 0.35 },
  { cap: Infinity, rate: 0.37 },
];

const RMD_DIVISOR = Object.fromEntries(
  Object.entries({
    73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1,
    80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2,
    87: 14.4, 88: 13.7, 89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1,
    94: 9.5, 95: 8.9, 96: 8.4, 97: 7.8, 98: 7.3, 99: 6.8, 100: 6.4,
    101: 6.0, 102: 5.6, 103: 5.2, 104: 4.9, 105: 4.6, 106: 4.3, 107: 4.1,
    108: 3.9, 109: 3.7, 110: 3.5, 111: 3.4, 112: 3.3, 113: 3.1, 114: 3.0,
    115: 2.9, 116: 2.8, 117: 2.7, 118: 2.5, 119: 2.3, 120: 2.0,
  })
);

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

function retirementStartDate(husbandDob, retireAge) {
  return new Date(husbandDob.getFullYear() + retireAge, husbandDob.getMonth(), husbandDob.getDate());
}

function retirementFirstCalendarYear(husbandDob, retireAge) {
  return husbandDob.getFullYear() + retireAge;
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

function rmdDivisorForAge(age) {
  if (!Number.isFinite(age)) return null;
  if (age < 73) return null;
  if (age >= 120) return 2.0;
  return RMD_DIVISOR[age] || null;
}

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
  let tax = 0;
  let lastCap = 0;
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

function futureValueOfAnnualContributions(annual, years, r) {
  if (!Number.isFinite(annual) || annual <= 0 || !Number.isFinite(years) || years <= 0) return 0;
  if (Math.abs(r) < 1e-14) return annual * years;
  return annual * ((Math.pow(1 + r, years) - 1) / r);
}

function run(st, nwSnapshot) {
  const hDob = parseISODate(st.husbandDob);
  const wDob = parseISODate(st.wifeDob);
  const childDobs = (st.children || []).map((c) => parseISODate(c.dob)).filter((d) => d instanceof Date);

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

  const now = new Date("2026-04-30");
  const retDate = retirementStartDate(hDob, st.retireAgeHusband);
  const yearsToRet = Math.max(0, (retDate - now) / (365.25 * 24 * 3600 * 1000));

  const lumpFV = totalNow * Math.pow(1 + retRate, yearsToRet);
  const contribAnnual = Math.max(0, st.annual401kContributionPreRetire || 0);
  const contribFV = futureValueOfAnnualContributions(contribAnnual, yearsToRet, retRate);
  const totalAtRetire = lumpFV + contribFV;
  let balH = totalAtRetire * splitH;
  let balW = totalAtRetire * splitW;
  let brokerageBalance = Math.max(0, st.currentBrokerageTotal || 0) * Math.pow(1 + retRate, yearsToRet);

  const rows = [];
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
      ageHi >= st.ageSS ? ssAnnualEachBase * Math.pow(1 + inflation, Math.max(0, year - ssStartYearH)) : 0;
    const ssW =
      ageWi >= st.ageSS ? ssAnnualEachBase * Math.pow(1 + inflation, Math.max(0, year - ssStartYearW)) : 0;
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
    let brokerageSaleGross = 0;

    if (!eligibleH && !eligibleW) {
      const flow0 = taxesAndFlow(0, 0);
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

    const { tax, expense: expenseBase, income, k401Total, ordinaryIncome } = taxesAndFlow(wdH, wdW);
    const brokerageCGTax = cgTaxPaidThisYear;
    const expense = expenseBase + brokerageCGTax;
    const net = income + brokerageWithdrawal - expense;

    rows.push({
      year,
      rental,
      k401Total,
      ssTotal,
      tax,
      income,
      ordinaryIncome,
      brokerageWithdrawal,
      brokerageCGTax,
      net,
    });

    brokerageBalance *= 1 + brokerageGrowth;
  }

  return { rows, startYear };
}

// —— 与 household-pl 默认假设对齐；401(k)/Brokerage 初值需手填才接近你界面 ——
const st = {
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
  brokerageGrowthPct: 5,
  taxRatePct: 0,
  brokerageCapitalGainTaxPct: 15,
  standardDeduction: 29200,
  ssTaxableRatio: 0.85,
  annual401kContributionPreRetire: 68000,
  current401kTotal: 1_200_000,
  currentBrokerageTotal: 400_000,
  children: [
    { id: "ch-a", dob: "2023-10-30" },
    { id: "ch-b", dob: "2026-01-14" },
  ],
};

const { rows, startYear } = run(st, { husband: 600_000, wife: 600_000, total: 1_200_000 });

const target = 2048;
const row = rows.find((r) => r.year === target);

console.log("startYear", startYear, "→ 2048 is index", 2048 - startYear);
if (!row) {
  console.log("No row for", target);
  process.exit(1);
}

const fedBase = row.ordinaryIncome - st.standardDeduction;
const federalOnly = calcProgressiveTax(Math.max(0, fedBase), FEDERAL_BRACKETS_MFJ);
const effOnOrdinary = row.tax / row.ordinaryIncome;
const effOnIncomeCol = row.tax / row.income;
const marginalNote =
  fedBase > 383900 - st.standardDeduction
    ? "taxable ordinary 已超过 24% 档顶部附近（见 MFJ 表）"
    : fedBase > 201050 - st.standardDeduction
      ? "边际联邦 ordinary 多为 22%–24% 区间（视具体 taxable）"
      : "见 MFJ 阶梯";

console.log(JSON.stringify(row, null, 2));
console.log("\n--- 税率（模型口径）---");
console.log("ordinaryIncome（联邦 ordinary 税基）=", Math.round(row.ordinaryIncome));
console.log("taxableOrdinary ≈ max(0, ordinaryIncome - SD)=", Math.round(Math.max(0, row.ordinaryIncome - st.standardDeduction)));
console.log("Tax 列 tax / ordinaryIncome（平均税负 on ordinary 口径）=", (effOnOrdinary * 100).toFixed(2) + "%");
console.log("Tax 列 tax / 总收入 income 列（仅供参考）=", (effOnIncomeCol * 100).toFixed(2) + "%");
console.log("州税假设 taxRatePct=", st.taxRatePct + "% → 州税为 ordinaryIncome×该比例");
console.log(marginalNote);
