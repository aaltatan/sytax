// Port of syriantaxescli cli/exporters.py: the same columns and formats, downloaded in the browser.
import writeExcelFile from "write-excel-file/browser";
import { parseAmount } from "../lib/amount";
import { lang, t } from "../lib/i18n";
import { FIELDS, toRecord, type FieldKey, type Salary } from "./services";
import { cleanMethod, type Settings } from "./settings";
import type { RoundingMethod } from "./taxes";

export const FORMATS = ["xlsx", "csv", "json", "jsonl"] as const;
export type Format = (typeof FORMATS)[number];

export function download(content: string, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCsv(salaries: Salary[]): string {
  const rows = [FIELDS.map((f) => f.key), ...salaries.map((s) => Object.values(toRecord(s)))];
  return rows.map((row) => row.join(",")).join("\r\n") + "\r\n";
}

export const toJson = (salaries: Salary[]) => JSON.stringify(salaries.map(toRecord), null, 4);
export const toJsonl = (salaries: Salary[]) => salaries.map((s) => JSON.stringify(toRecord(s)) + "\n").join("");

const MAX_FORMULA = 8192; // Excel's limit on a formula's length

/** Excel version of taxes.ts roundTo: x rounded to a multiple of step; x/step is cut to 9 places to drop float noise. */
export function excelRound(x: string, method: RoundingMethod, step: string): string {
  const q = `ROUND((${x})/${step},9)`;
  const integral: Record<RoundingMethod, string> = {
    CEILING: `-INT(-${q})`,
    FLOOR: `INT(${q})`,
    UP: `ROUNDUP(${q},0)`,
    DOWN: `TRUNC(${q})`,
    HALF_UP: `ROUND(${q},0)`, // Excel rounds halves away from zero
    HALF_DOWN: `SIGN(${q})*-INT(0.5-ABS(${q}))`,
    HALF_EVEN: `IF(MOD(${q},1)=0.5,2*ROUND(${q}/2,0),ROUND(${q},0))`,
    "05UP": `IF(OR(MOD(ABS(TRUNC(${q})),10)=0,MOD(ABS(TRUNC(${q})),10)=5),ROUNDUP(${q},0),TRUNC(${q}))`,
  };
  return `(${integral[method]})*${step}`;
}

/** The Rules sheet (brackets, compensation rate, rounding steps) and the tax formulas that read it, like taxes.ts. */
export function taxSheet(settings: Settings) {
  const { tax } = settings;
  const n = tax.brackets.length;
  const br = tax.bracket_rounding;
  const num = (v: string) => parseAmount(v)!.toNumber();
  const bold = (value: string) => ({ value, fontWeight: "bold" as const });
  const ref = (c: string, r: number) => `Rules!$${c}$${r}`;
  const [compRate, step, brStep] = [ref("B", n + 3), ref("B", n + 4), ref("B", n + 5)];
  const main = (x: string) => excelRound(x, cleanMethod(tax.rounding.method)!, step);
  const own = (x: string) => excelRound(x, cleanMethod(br.method)!, brStep);

  const rows = [
    [bold(t("الحد الأدنى", "Lower")), bold(t("النسبة", "Rate"))],
    ...tax.brackets.map((b) => [{ value: num(b.lower), format: "#,##0.00" }, { value: num(b.rate), format: "0.00%" }]),
    [],
    [t("نسبة ضريبة التعويضات", "Compensation tax rate"), { value: num(tax.compensation_tax_rate), format: "0.00%" }],
    [t("خطوة التقريب", "Rounding step"), num(tax.rounding.step), tax.rounding.method],
    ...(br.enabled ? [[t("خطوة تقريب ضريبة الراتب", "Salary tax rounding step"), num(br.step), `${br.method} (${br.mode})`]] : []),
  ];

  /** `taxable` is the cell expression of a row's taxable salary. */
  const salaryTax = (taxable: string) => {
    const parts = tax.brackets.map((_, i) => {
      const top = i < n - 1 ? `MIN(${taxable},${ref("A", i + 3)})` : taxable;
      const part = `${ref("B", i + 2)}*MAX(${top}-${ref("A", i + 2)},0)`;
      return br.enabled && br.mode === "each" ? own(part) : part;
    });
    return (br.enabled && br.mode === "total" ? own : main)(parts.join("+"));
  };
  return { rows, salaryTax, compensationTax: (compensation: string) => main(`${compensation}*${compRate}`) };
}

/** `taxOnFullSalary`: salary tax was taken on the whole salary and social security cut after it (the range page's "cut" mode). */
export async function exportSalaries(
  salaries: Salary[],
  name: string,
  format: Format,
  settings: Settings,
  taxOnFullSalary = false,
): Promise<void> {
  const file = `${name}.${format}`;
  if (format === "csv") return download(toCsv(salaries), file, "text/csv");
  if (format === "json") return download(toJson(salaries), file, "application/json");
  if (format === "jsonl") return download(toJsonl(salaries), file, "application/jsonl");

  const header = [{ value: "#", fontWeight: "bold" as const }, ...FIELDS.map((f) => ({ value: f.header, fontWeight: "bold" as const }))];
  // Column A is "#", fields start at B. All but the amounts and social security are formulas, so edits in Excel flow through;
  // social security stays a value since it may be on an insured salary that isn't in the sheet.
  const col = (key: FieldKey) => String.fromCharCode(66 + FIELDS.findIndex((f) => f.key === key));
  const rules = taxSheet(settings);
  const formulas: Partial<Record<FieldKey, (r: number) => string>> = {
    total: (r) => `${col("salary")}${r}+${col("compensation")}${r}`,
    salary_tax: (r) => rules.salaryTax(taxOnFullSalary ? `${col("salary")}${r}` : `(${col("salary")}${r}-${col("social_security")}${r})`),
    compensation_tax: (r) => rules.compensationTax(`${col("compensation")}${r}`),
    taxes: (r) => `${col("salary_tax")}${r}+${col("compensation_tax")}${r}`,
    deductions: (r) => `${col("social_security")}${r}+${col("taxes")}${r}`,
    net: (r) => `${col("total")}${r}-${col("deductions")}${r}`,
    compensation_ratio: (r) => `IF(${col("total")}${r}=0,0,${col("compensation")}${r}/${col("total")}${r})`,
  };
  const body = salaries.map((s, i) => [
    { value: i + 1 },
    ...FIELDS.map((f) => {
      const format = f.key === "compensation_ratio" ? "0.00%" : "#,##0.00";
      const formula = formulas[f.key]?.(i + 2);
      // Many brackets with nested rounding can outgrow Excel's limit: write the app's value then.
      return formula && formula.length <= MAX_FORMULA
        ? { type: "Formula" as const, value: formula, format }
        : { value: s[f.key].toNumber(), format };
    }),
  ]);
  const rtl = lang === "ar";
  await writeExcelFile([
    { data: [header, ...body], sheet: "Salaries", rightToLeft: rtl },
    { data: rules.rows, sheet: "Rules", rightToLeft: rtl },
  ]).toFile(file);
}
