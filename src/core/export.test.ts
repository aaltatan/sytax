import { describe, expect, it } from "vitest";
import { defaultSettings } from "./defaults";
import { taxSheet } from "./export";
import { calculateGross } from "./services";
import { toRules } from "./settings";
import { Decimal, ROUNDING_METHODS } from "./taxes";

// A tiny evaluator for just the Excel functions export.ts writes, so its formulas can be checked against the app.
const round = (x: number, d: number) => (Math.sign(x) * Math.round(Math.abs(x) * 10 ** d)) / 10 ** d;
const FNS = {
  ROUND: round,
  ROUNDUP: (x: number) => Math.sign(x) * Math.ceil(Math.abs(x)),
  TRUNC: Math.trunc,
  INT: Math.floor,
  SIGN: Math.sign,
  ABS: Math.abs,
  MOD: (a: number, b: number) => a - b * Math.floor(a / b),
  MIN: Math.min,
  MAX: Math.max,
  IF: (c: boolean, a: number, b: number) => (c ? a : b),
  OR: (...xs: boolean[]) => xs.some(Boolean),
};

type Cell = string | number | { value: string | number } | undefined;

function evaluate(formula: string, rules: Cell[][], cells: Record<string, number>): number {
  const js = formula
    .replace(/Rules!\$([A-Z])\$(\d+)/g, '$rules("$1",$2)')
    .replace(/\b([A-K]\d+)\b/g, '$cells.$1')
    .replace(/(?<![<>!=])=(?!=)/g, "==");
  const lookup = (c: string, r: number) => {
    const cell = rules[r - 1][c.charCodeAt(0) - 65];
    return Number(typeof cell === "object" ? cell.value : cell);
  };
  return new Function(...Object.keys(FNS), "$rules", "$cells", `return ${js};`)(...Object.values(FNS), lookup, cells);
}

const SALARIES = [0, 12560, 12561.49, 15000, 19999.99, 20000, 23456.78, 50000.5, 87654.32, 250000];

describe("xlsx tax formulas", () => {
  for (const method of ROUNDING_METHODS) {
    for (const step of ["1", "100", "0.01"]) {
      for (const mode of ["off", "each", "total"] as const) {
        it(`${method} step ${step}, bracket rounding ${mode}`, () => {
          const s = defaultSettings();
          s.tax.brackets = [
            { lower: "0", rate: "0" },
            { lower: "12560", rate: "0.05" },
            { lower: "20000", rate: "0.1" },
            { lower: "50000", rate: "0.15" },
          ];
          s.tax.rounding = { method, step };
          s.tax.bracket_rounding = { enabled: mode !== "off", mode: mode === "total" ? "total" : "each", method: "HALF_EVEN", step: "10" };
          s.tax.social_security.enabled = true;
          const sheet = taxSheet(s);
          for (const amount of SALARIES) {
            const salary = new Decimal(amount);
            const want = calculateGross(toRules(s), salary, salary, salary.lt(12560) ? new Decimal(12560) : null);
            const cells = { B2: amount, C2: amount, E2: want.social_security.toNumber() };
            expect(evaluate(sheet.salaryTax("(B2-E2)"), sheet.rows, cells), `salary ${amount}`).toBeCloseTo(want.salary_tax.toNumber(), 6);
            expect(evaluate(sheet.compensationTax("C2"), sheet.rows, cells), `compensation ${amount}`).toBeCloseTo(want.compensation_tax.toNumber(), 6);
          }
        });
      }
    }
  }
});
