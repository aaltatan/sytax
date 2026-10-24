import { describe, expect, it } from "vitest";
import { groupDigits, parseAmount } from "../lib/amount";
import { defaultSettings } from "./defaults";
import { amountRange, calculateGross, calculateNet, calculateNetRange, cutSocialSecurity, RangeTooBigError, toRecord } from "./services";
import { toRules, validate, type Settings } from "./settings";
import { Decimal, roundTo, SalaryBelowMinimumError } from "./taxes";

const d = (v: string | number) => new Decimal(v);

// The syria-2024 preset the expected records below were made with (the app's defaults have since changed).
function settings(change: (s: Settings) => void = () => {}): Settings {
  const s = defaultSettings();
  s.tax.min_salary = "837000";
  s.tax.rounding = { method: "HALF_UP", step: "100" };
  s.tax.brackets = [
    { lower: "0", rate: "0" },
    { lower: "837000", rate: "0.11" },
    { lower: "850000", rate: "0.13" },
    { lower: "1100000", rate: "0.15" },
  ];
  s.tax.social_security.min_salary = "750000";
  change(s);
  return s;
}

// Expected records come from the real CLI on the bare syria-2024 preset, except net to gross, where the CLI
// overshoots the net (it counts up from the unrounded gross) and these are the smallest gross that pays it:
// SYRIANTAXES_CONFIG_HOME=<empty dir> sytax [global options] <command> -o json
describe("matches sytax 0.2.0", () => {
  const golden: [string, () => unknown, Record<string, number>][] = [
    [
      "gross 1000000 100000",
      () => calculateGross(toRules(settings()), d(1e6), d(1e5)),
      { salary: 1000000, compensation: 100000, total: 1100000, social_security: 0, salary_tax: 20900, compensation_tax: 5000, taxes: 25900, deductions: 25900, net: 1074100, compensation_ratio: 0.09090909090909091 },
    ],
    [
      "--ss gross 1000000 100000 -i 750000",
      () => calculateGross(toRules(settings(), true), d(1e6), d(1e5), d(750000)),
      { salary: 1000000, compensation: 100000, total: 1100000, social_security: 52500, salary_tax: 14100, compensation_tax: 5000, taxes: 19100, deductions: 71600, net: 1028400, compensation_ratio: 0.09090909090909091 },
    ],
    [
      "net 1500000",
      () => calculateNet(toRules(settings()), d(1500000)),
      { salary: 1610500, compensation: 0, total: 1610500, social_security: 0, salary_tax: 110500, compensation_tax: 0, taxes: 110500, deductions: 110500, net: 1500000, compensation_ratio: 0 },
    ],
    [
      "net 2000000 -r 0.25",
      () => calculateNet(toRules(settings()), d(2e6), d("0.25")),
      { salary: 1610500, compensation: 526300, total: 2136800, social_security: 0, salary_tax: 110500, compensation_tax: 26300, taxes: 136800, deductions: 136800, net: 2000000, compensation_ratio: 0.24630288281542492 },
    ],
    [
      "net 900000 -r 0.5 (salary part below the minimum)",
      () => calculateNet(toRules(settings()), d(900000), d("0.5")),
      { salary: 837000, compensation: 66300, total: 903300, social_security: 0, salary_tax: 0, compensation_tax: 3300, taxes: 3300, deductions: 3300, net: 900000, compensation_ratio: 0.07339754234473597 },
    ],
    [
      "--ss net 1234567",
      () => calculateNet(toRules(settings(), true), d(1234567)),
      { salary: 1395986, compensation: 0, total: 1395986, social_security: 97719, salary_tax: 63700, compensation_tax: 0, taxes: 63700, deductions: 161419, net: 1234567, compensation_ratio: 0 },
    ],
    [
      "--taxes-rounding-method round_05up --taxes-round-to-nearest 1000 gross 1234567 98765",
      () =>
        calculateGross(
          toRules(settings((s) => (s.tax.rounding = { method: "05UP", step: "1000" }))),
          d(1234567),
          d(98765),
        ),
      { salary: 1234567, compensation: 98765, total: 1333332, social_security: 0, salary_tax: 54000, compensation_tax: 4000, taxes: 58000, deductions: 58000, net: 1275332, compensation_ratio: 0.07407382407382407 },
    ],
    [
      "--taxes-rounding-method round_half_even gross 1100050",
      () => calculateGross(toRules(settings((s) => (s.tax.rounding.method = "HALF_EVEN"))), d(1100050)),
      { salary: 1100050, compensation: 0, total: 1100050, social_security: 0, salary_tax: 33900, compensation_tax: 0, taxes: 33900, deductions: 33900, net: 1066150, compensation_ratio: 0 },
    ],
    [
      "--ss --ss-deduction-rate 0.09 --ss-rounding-method round_ceiling --ss-round-to-nearest 10 net 3333333 -r 0.1",
      () =>
        calculateNet(
          toRules(
            settings((s) => {
              s.tax.social_security = { ...s.tax.social_security, enabled: true, rate: "0.09", rounding: { method: "CEILING", step: "10" } };
            }),
          ),
          d(3333333),
          d("0.1"),
        ),
      { salary: 3709019, compensation: 350834, total: 4059853, social_security: 333820, salary_tax: 375200, compensation_tax: 17500, taxes: 392700, deductions: 726520, net: 3333333, compensation_ratio: 0.08641544410598118 },
    ],
  ];

  it.each(golden)("%s", (_, run, expected) => {
    expect(toRecord(run() as never)).toEqual(expected);
  });

  it("range 1000000 1200000 100000 -r 0.25", () => {
    const s = settings();
    const nets = amountRange(d(1e6), d(1.2e6), d(1e5), { maxSize: 1000, stopFactor: d(10), stepDivisor: d(10) });
    const rows = calculateNetRange(toRules(s), nets, d("0.25")).map(toRecord);
    expect(rows.map((r) => [r.salary, r.compensation, r.net])).toEqual([
      [837000, 171600, 1000000],
      [837000, 276800, 1100000],
      [909100, 315800, 1200000],
    ]);
  });
});

describe("scenarios from syriantaxescli tests/test_scenarios.py", () => {
  it("a candidate's net offer checks out the other way", () => {
    const rules = toRules(settings());
    const offer = calculateNet(rules, d(1500000));
    const check = calculateGross(rules, offer.salary, offer.compensation);
    expect(toRecord(check)).toEqual(toRecord(offer));
    expect(check.net.gte(1500000)).toBe(true);
  });

  it("a salary scale from 1M to 2M, a quarter as compensations", () => {
    const nets = amountRange(d(1e6), d(2e6), d(1e5), { maxSize: 1000, stopFactor: d(10), stepDivisor: d(10) });
    const rows = calculateNetRange(toRules(settings()), nets, d("0.25"));
    expect(rows).toHaveLength(11);
    rows.forEach((row, i) => expect(Math.abs(row.net.toNumber() - (1e6 + i * 1e5))).toBeLessThan(200));
  });

  it("new brackets set once apply to every calculation", () => {
    const rules = toRules(
      settings((s) => {
        s.tax.brackets = [
          { lower: "0", rate: "0" },
          { lower: "1000000", rate: "0.1" },
          { lower: "2000000", rate: "0.2" },
        ];
        s.tax.min_salary = "1000000";
        s.tax.compensation_tax_rate = "0.04";
        s.tax.rounding = { method: "CEILING", step: "1000" };
      }),
    );
    const payslip = calculateGross(rules, d(1500000), d(100000));
    expect(payslip.salary_tax.toNumber()).toBe(50000);
    expect(payslip.compensation_tax.toNumber()).toBe(4000);
  });

  it("rounds each bracket's tax before adding them up", () => {
    // 13000 × 0.11 = 1430 → 1000, 150000 × 0.13 = 19500 → 20000; without it the total 20930 → 20900.
    const rules = toRules(settings((s) => (s.tax.bracket_rounding = { enabled: true, mode: "each", method: "HALF_UP", step: "1000" })));
    expect(calculateGross(rules, d(1e6)).salary_tax.toNumber()).toBe(21000);
    expect(calculateNet(rules, d(1500000)).net.gte(1500000)).toBe(true);
  });

  it("rounds the brackets tax total with its own rounding", () => {
    // 20930 → 21000 by the brackets' own rounding; the compensation tax keeps the general rounding to 100.
    const rules = toRules(settings((s) => (s.tax.bracket_rounding = { enabled: true, mode: "total", method: "CEILING", step: "1000" })));
    const payslip = calculateGross(rules, d(1e6), d(12345));
    expect(payslip.salary_tax.toNumber()).toBe(21000);
    expect(payslip.compensation_tax.toNumber()).toBe(600);
  });

  // Rounding makes net jump around as gross grows, so check every gross below the answer within a wide window.
  it.each([
    ["defaults", defaultSettings()],
    ["syria-2024", settings()],
    ["social security", settings((s) => (s.tax.social_security.enabled = true))],
    ["each bracket", settings((s) => (s.tax.bracket_rounding = { enabled: true, mode: "each", method: "HALF_UP", step: "1000" }))],
    ["total", settings((s) => (s.tax.bracket_rounding = { enabled: true, mode: "total", method: "FLOOR", step: "500" }))],
  ])("net to gross finds the smallest gross paying the net (%s)", (_, s) => {
    const rules = toRules(s);
    for (const net of [15000, 15030, 900000, 1234567, 1500000, 2000001]) {
      if (net < Number(s.tax.min_salary)) continue;
      const { salary, net: paid } = calculateNet(rules, d(net));
      expect(paid.gte(net), `${net}`).toBe(true);
      for (let g = salary.toNumber() - 1; g > salary.toNumber() - 3000 && g >= 837000 * Number(s.tax.social_security.enabled); g--) {
        expect(calculateGross(rules, d(g)).net.lt(net), `${net}: ${g} pays it too`).toBe(true);
      }
    }
  });

  it("compensation always pays at least its net share", () => {
    const rules = toRules(defaultSettings());
    for (const net of [15000, 20000, 33333, 100030]) {
      expect(calculateNet(rules, d(net), d("0.5")).net.gte(net), `${net}`).toBe(true);
    }
  });

  it("social security turned on for everyone", () => {
    const s = settings((s) => {
      s.tax.social_security.enabled = true;
      s.tax.social_security.rate = "0.09";
    });
    expect(calculateGross(toRules(s), d(1e6)).social_security.toNumber()).toBe(90000);
    expect(calculateGross(toRules(s, false), d(1e6)).social_security.toNumber()).toBe(0);
  });

  it("net to gross on a fixed insured salary: the smallest gross that pays the net", () => {
    const rules = toRules(settings(), true);
    for (const net of [837000, 1234567, 3333333]) {
      const s = calculateNet(rules, d(net), d("0.25"), d(800000));
      expect(s.social_security.toNumber(), `${net}`).toBe(56000);
      expect(s.net.gte(net), `${net}`).toBe(true);
      expect(calculateGross(rules, s.salary.sub(1), s.compensation, d(800000)).net.lt(net), `${net}`).toBe(true);
    }
  });

  it("cut social security keeps the taxes and lowers the net", () => {
    const plain = calculateNet(toRules(settings(), false), d(1e6));
    const cut = cutSocialSecurity(toRules(settings(), true), plain, d(800000));
    expect([cut.salary, cut.salary_tax, cut.social_security, cut.net].map(Number)).toEqual([plain.salary, plain.salary_tax, 56000, plain.net.sub(56000)].map(Number));
  });
});

describe("errors", () => {
  it("net below the minimum salary", () => {
    expect(() => calculateNet(toRules(settings()), d(800000))).toThrow(SalaryBelowMinimumError);
  });

  it("insured salary below the social security minimum", () => {
    expect(() => calculateGross(toRules(settings(), true), d(1e6), d(0), d(700000))).toThrow(/insured salary/);
  });

  it("range defaults and limits", () => {
    const opts = { maxSize: 1000, stopFactor: d(10), stepDivisor: d(10) };
    expect(amountRange(d(1e6), null, null, opts)).toHaveLength(91);
    expect(() => amountRange(d(1), d(1e6), d(1), opts)).toThrow(RangeTooBigError);
    expect(() => amountRange(d(2), d(1), d(1), opts)).toThrow(/stop/);
    expect(() => amountRange(d(1), d(2), d(0), opts)).toThrow(/step/);
  });


  it("settings validation", () => {
    expect(validate(settings())).toEqual({});
    expect(Object.keys(validate(settings((s) => (s.tax.brackets[0].lower = "5"))))).toEqual(["tax.brackets"]);
    expect(Object.keys(validate(settings((s) => (s.tax.brackets[2].lower = "800000"))))).toEqual(["tax.brackets"]);
    expect(Object.keys(validate(settings((s) => (s.tax.compensation_tax_rate = "1"))))).toEqual(["tax.compensation_tax_rate"]);
    expect(Object.keys(validate(settings((s) => (s.tax.rounding.step = "0"))))).toEqual(["tax.rounding.step"]);
  });
});

describe("helpers", () => {
  it("parses amounts like the CLI, plus Arabic digits", () => {
    for (const text of ["1000000", "1,000,000", "1_000_000", "1e6", "١٬٠٠٠٬٠٠٠", " ۱۰۰۰۰۰۰ "]) {
      expect(parseAmount(text)?.toNumber()).toBe(1e6);
    }
    expect(parseAmount("٠٫٢٥")?.toNumber()).toBe(0.25);
    expect(parseAmount("1,000,00O")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });

  it("groups typed amounts by thousands, leaving other text as typed", () => {
    expect(["12560", "1234567.50", "100", "12.", "", "1e6", "١٢٥٦٠", "abc"].map(groupDigits)).toEqual(["12,560", "1,234,567.50", "100", "12.", "", "1e6", "١٢٥٦٠", "abc"]);
  });

  it("rounds like Python's decimal modes", () => {
    const cases: [string, number, number][] = [
      ["HALF_UP", 250, 300],
      ["HALF_EVEN", 250, 200],
      ["HALF_DOWN", 250, 200],
      ["CEILING", 201, 300],
      ["FLOOR", 299, 200],
      ["UP", 201, 300],
      ["DOWN", 299, 200],
      ["05UP", 501, 600], // last digit 5 rounds away from zero
      ["05UP", 401, 400],
    ];
    for (const [method, amount, expected] of cases) {
      expect(roundTo(d(100), method as never)(d(amount)).toNumber(), `${method} ${amount}`).toBe(expected);
    }
  });
});
