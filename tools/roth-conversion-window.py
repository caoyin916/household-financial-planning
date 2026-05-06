"""
Mirror sim-year.mjs `run()` to list per-year ordinary income and suggest
Roth conversion windows (lower existing ordinary = more room to fill low brackets).
Run: python tools/roth-conversion-window.py
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, datetime

PROJECTION_YEARS = 50
FEDERAL_BRACKETS_MFJ = [
    (23200, 0.10),
    (94300, 0.12),
    (201050, 0.22),
    (383900, 0.24),
    (487450, 0.32),
    (731200, 0.35),
    (float("inf"), 0.37),
]

RMD_DIVISOR = {
    73: 26.5,
    74: 25.5,
    75: 24.6,
    76: 23.7,
    77: 22.9,
    78: 22.0,
    79: 21.1,
    80: 20.2,
    81: 19.4,
    82: 18.5,
    83: 17.7,
    84: 16.8,
    85: 16.0,
    86: 15.2,
    87: 14.4,
    88: 13.7,
    89: 12.9,
    90: 12.2,
    91: 11.5,
    92: 10.8,
    93: 10.1,
    94: 9.5,
    95: 8.9,
    96: 8.4,
    97: 7.8,
    98: 7.3,
    99: 6.8,
    100: 6.4,
    101: 6.0,
    102: 5.6,
    103: 5.2,
    104: 4.9,
    105: 4.6,
    106: 4.3,
    107: 4.1,
    108: 3.9,
    109: 3.7,
    110: 3.5,
    111: 3.4,
    112: 3.3,
    113: 3.1,
    114: 3.0,
    115: 2.9,
    116: 2.8,
    117: 2.7,
    118: 2.5,
    119: 2.3,
    120: 2.0,
}


def parse_iso(s: str) -> date | None:
    if not s or not isinstance(s, str):
        return None
    p = s.strip().split("-")
    if len(p) < 3:
        return None
    y, m, d = int(p[0]), int(p[1]), int(p[2])
    return date(y, m, d)


def age_years_at(dob: date, ref: date) -> float:
    return (ref - dob).days / 365.25


def age_on_dec31(year: int, dob: date) -> int:
    ref = date(year, 12, 31)
    a = ref.year - dob.year
    bday = date(year, dob.month, dob.day)
    if ref < bday:
        a -= 1
    return a


def college_tuition_years(dob: date, years_count: int) -> list[int]:
    turn18 = dob.year + 18
    first = turn18 + 1 if dob.month >= 9 else turn18
    return [first + k for k in range(years_count)]


def first_intl_year(dob: date, start_age: int) -> int | None:
    for y in range(dob.year, dob.year + 41):
        if age_on_dec31(y, dob) >= start_age:
            return y
    return None


def last_intl_before_college(dob: date, tuition_years: int) -> int | None:
    cy = college_tuition_years(dob, tuition_years)
    return cy[0] - 1 if cy else None


def intl_fee_year(year: int, dob: date, tuition_years: int, annual: float, start_age: int) -> float:
    if annual <= 0:
        return 0.0
    fy = first_intl_year(dob, start_age)
    ly = last_intl_before_college(dob, tuition_years)
    if fy is None or ly is None or fy > ly:
        return 0.0
    return float(annual) if fy <= year <= ly else 0.0


def rmd_divisor(age: int) -> float | None:
    if age < 73:
        return None
    if age >= 120:
        return 2.0
    return RMD_DIVISOR.get(age)


def sched_401k(
    bal: float, age_frac: float, age_dec: int, age_401k: float, rmd_start: int, withdraw_rate: float
) -> float:
    if age_frac < age_401k:
        return 0.0
    wd = bal * withdraw_rate
    if age_dec >= rmd_start:
        d = rmd_divisor(age_dec)
        if d:
            wd = max(wd, bal / d)
    return min(wd, bal)


def calc_progressive(taxable: float) -> float:
    rem = max(0.0, taxable)
    tax = 0.0
    last = 0.0
    for cap, rate in FEDERAL_BRACKETS_MFJ:
        if rem <= 0:
            break
        span = min(rem, cap - last)
        if span > 0:
            tax += span * rate
            rem -= span
        last = cap
    return tax


def future_value_annuity(annual: float, years: float, r: float) -> float:
    if annual <= 0 or years <= 0:
        return 0.0
    if abs(r) < 1e-14:
        return annual * years
    return annual * ((1 + r) ** years - 1) / r


def federal_marginal_rate(taxable_ordinary: float) -> float:
    """Marginal rate on the last dollar of taxable ordinary income (MFJ)."""
    t = max(0.0, taxable_ordinary)
    last = 0.0
    for cap, rate in FEDERAL_BRACKETS_MFJ:
        if t <= cap - last:
            return rate
        t -= cap - last
        last = cap
    return FEDERAL_BRACKETS_MFJ[-1][1]


@dataclass
class St:
    husband_dob: str
    wife_dob: str
    retire_age_husband: int
    rental_year1: float
    rental_growth_pct: float
    tuition_annual: float
    tuition_years: int
    intl_annual: float
    intl_start_age: int
    living_year1: float
    inflation_pct: float
    age401k: float
    ret401k_pct: float
    withdraw_rate_pct: float
    rmd_start_age: int
    age_ss: int
    ss_monthly_each: float
    brokerage_growth_pct: float
    tax_rate_pct: float
    cg_pct: float
    standard_deduction: float
    ss_taxable_ratio: float
    annual_401k_contrib: float
    current_401k: float
    current_brokerage: float
    children: list


def run(st: St, nw: dict) -> list[dict]:
    h = parse_iso(st.husband_dob)
    w = parse_iso(st.wife_dob)
    assert h and w
    child_dobs = [parse_iso(c["dob"]) for c in st.children if parse_iso(c["dob"])]
    start_year = h.year + st.retire_age_husband
    tuition_sets = [college_tuition_years(cd, st.tuition_years) for cd in child_dobs]

    g = st.rental_growth_pct / 100.0
    infl = st.inflation_pct / 100.0
    rr = st.ret401k_pct / 100.0
    bg = st.brokerage_growth_pct / 100.0
    wr = st.withdraw_rate_pct / 100.0
    tr = st.tax_rate_pct / 100.0

    split_b = nw["husband"] + nw["wife"]
    sh = nw["husband"] / split_b if split_b > 0 else 0.5
    sw = nw["wife"] / split_b if split_b > 0 else 0.5

    now = date(2026, 4, 30)
    ret = date(h.year + st.retire_age_husband, h.month, h.day)
    ytr = max(0.0, (ret - now).days / 365.25)

    lump = max(0.0, st.current_401k) * (1 + rr) ** ytr
    cfv = future_value_annuity(st.annual_401k_contrib, ytr, rr)
    total_r = lump + cfv
    bal_h, bal_w = total_r * sh, total_r * sw
    brok = max(0.0, st.current_brokerage) * (1 + rr) ** ytr

    rows = []
    deferred_cg = 0.0

    for i in range(PROJECTION_YEARS):
        year = start_year + i
        cg_pay = deferred_cg
        deferred_cg = 0.0

        rental = st.rental_year1 * (1 + g) ** i
        living = st.living_year1 * (1 + infl) ** i
        brok_start = brok

        tuition = 0.0
        for ty in tuition_sets:
            if year in ty:
                tuition += st.tuition_annual

        intl = 0.0
        for cd in child_dobs:
            intl += intl_fee_year(year, cd, st.tuition_years, st.intl_annual, st.intl_start_age)

        bal_h *= 1 + rr
        bal_w *= 1 + rr

        dec31 = date(year, 12, 31)
        age_hf = age_years_at(h, dec31)
        age_wf = age_years_at(w, dec31)
        age_hi = age_on_dec31(year, h)
        age_wi = age_on_dec31(year, w)

        ss_base = st.ss_monthly_each * 12
        sy_h = h.year + int(st.age_ss)
        sy_w = w.year + int(st.age_ss)
        ss_h = ss_base * (1 + infl) ** max(0, year - sy_h) if age_hi >= st.age_ss else 0.0
        ss_w = ss_base * (1 + infl) ** max(0, year - sy_w) if age_wi >= st.age_ss else 0.0
        ss_tot = ss_h + ss_w
        ss_tax = ss_tot * st.ss_taxable_ratio

        elig_h = age_hf >= st.age401k
        elig_w = age_wf >= st.age401k

        def taxes(k401_t: float) -> dict:
            ord_inc = rental + k401_t + ss_tax
            tx_ord = max(0.0, ord_inc - st.standard_deduction)
            fed = calc_progressive(tx_ord)
            tax = fed + ord_inc * tr
            exp0 = living + intl + tuition + tax
            inc0 = rental + k401_t + ss_tot
            return {
                "tax": tax,
                "expense": exp0,
                "income": inc0,
                "k401": k401_t,
                "ordinary": ord_inc,
                "taxable_ord": tx_ord,
            }

        wd_h = wd_w = 0.0
        if not elig_h and not elig_w:
            f0 = taxes(0.0)
            a = max(0.0, f0["expense"] + cg_pay - f0["income"])
            net_f = 1 - max(0.0, min(0.9999, st.cg_pct / 100.0))
            if a > 0 and brok_start > 0 and net_f > 1e-9:
                sale = min(a / net_f, brok_start)
                deferred_cg = sale * (st.cg_pct / 100.0)
            else:
                sale = 0.0
            brok = brok_start - sale
        else:
            wd_h = sched_401k(bal_h, age_hf, age_hi, st.age401k, st.rmd_start_age, wr) if elig_h else 0.0
            wd_w = sched_401k(bal_w, age_wf, age_wi, st.age401k, st.rmd_start_age, wr) if elig_w else 0.0
            for _ in range(55):
                t = taxes(wd_h + wd_w)
                gap = t["expense"] + cg_pay - t["income"]
                if gap <= 1:
                    break
                rem_h = max(0.0, bal_h - wd_h) if elig_h else 0.0
                rem_w = max(0.0, bal_w - wd_w) if elig_w else 0.0
                rem = rem_h + rem_w
                if rem <= 0.01:
                    break
                step = min(gap * 1.12, rem)
                rh = rem_h / rem if rem else 0.0
                rw = rem_w / rem if rem else 0.0
                wd_h = min(bal_h, wd_h + step * rh) if elig_h else 0.0
                wd_w = min(bal_w, wd_w + step * rw) if elig_w else 0.0
            bal_h -= wd_h
            bal_w -= wd_w
            brok = brok_start

        out = taxes(wd_h + wd_w)
        brok *= 1 + bg

        rows.append(
            {
                "year": year,
                "ordinary": out["ordinary"],
                "taxable_ord": out["taxable_ord"],
                "k401": out["k401"],
                "ss": ss_tot,
                "rental": rental,
                "marginal": federal_marginal_rate(out["taxable_ord"]),
                "age_h": age_hi,
                "age_w": age_wi,
                "tuition_intl": tuition + intl,
            }
        )

    return rows


def main() -> None:
    st = St(
        husband_dob="1986-09-16",
        wife_dob="1989-03-02",
        retire_age_husband=50,
        rental_year1=90000,
        rental_growth_pct=1.0,
        tuition_annual=80000,
        tuition_years=4,
        intl_annual=40000,
        intl_start_age=3,
        living_year1=40000,
        inflation_pct=3.0,
        age401k=59.5,
        ret401k_pct=8.0,
        withdraw_rate_pct=4.0,
        rmd_start_age=73,
        age_ss=67,
        ss_monthly_each=2000,
        brokerage_growth_pct=5.0,
        tax_rate_pct=0.0,
        cg_pct=15.0,
        standard_deduction=29200,
        ss_taxable_ratio=0.85,
        annual_401k_contrib=68000,
        current_401k=1_200_000,
        current_brokerage=400_000,
        children=[{"dob": "2023-10-30"}, {"dob": "2026-01-14"}],
    )
    nw = {"husband": 600_000, "wife": 600_000, "total": 1_200_000}

    rows = run(st, nw)
    # Top of 24% bracket taxable ordinary = 383900
    cap24 = 383_900

    print("=== household-pl 默认假设：逐日历年「已有 ordinary」与联邦边际档 ===")
    print("(Roth 转换额会计入 ordinary；表格为转换前的基准。)")
    print()
    for r in rows:
        m = r["marginal"] * 100
        headroom = max(0.0, cap24 - r["taxable_ord"])
        tag = ""
        if r["ordinary"] < 250_000 and r["k401"] < 200_000:
            tag = "  ← 相对更适合填档转换（ordinary 仍较低）"
        elif r["marginal"] <= 0.24 and headroom > 30_000:
            tag = "  ← 边际≤24% 且距32% 档尚有空间"
        print(
            f"{r['year']}  ageH={r['age_h']:2d} ageW={r['age_w']:2d}  "
            f"ord=${r['ordinary']:,.0f}  taxable=${r['taxable_ord']:,.0f}  "
            f"k401=${r['k401']:,.0f}  SS=${r['ss']:,.0f}  marg={m:.0f}%  "
            f"room_to_32%_edge≈${headroom:,.0f}  tuition+intl=${r['tuition_intl']:,.0f}{tag}"
        )

    print()
    print("--- 摘要（策略含义）---")
    sy = rows[0]["year"]
    min_ord = min(r["ordinary"] for r in rows)
    lowest_years = [r["year"] for r in rows if abs(r["ordinary"] - min_ord) < 1000]
    print(f"退休首年 {sy}；模拟全期内 ordinary 最低的年份约 {lowest_years[:5]}…（若与你界面一致，优先在这些年考虑转换）。")
    ss_years = [r["year"] for r in rows if r["ss"] > 0]
    if ss_years:
        print(f"社安开始出现：{min(ss_years)} 年起（模型）。此后 ordinary 基线上升。")
    rmd_years = [r for r in rows if r["age_h"] >= 73 or r["age_w"] >= 73]
    if rmd_years:
        print(f"RMD 年龄起（夫妇任一方≥73）：自 {rmd_years[0]['year']} 年起提款压力更大，边际档易升高。")


if __name__ == "__main__":
    main()
