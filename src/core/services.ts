// Port of syriantaxescli core/services.py and core/salary.py.
import { t } from "../lib/i18n";
import { compensationTax, Decimal, RuleError, salaryBreakdown, socialSecurityDeduction, splitNetPackage, type TaxRules } from "./taxes";

/** A gross salary and compensation, with everything deducted from them. */
export interface Salary {
  salary: Decimal;
  compensation: Decimal;
  total: Decimal;
  social_security: Decimal;
  salary_tax: Decimal;
  compensation_tax: Decimal;
  taxes: Decimal;
  deductions: Decimal;
  net: Decimal;
  compensation_ratio: Decimal;
}

export type FieldKey = keyof Salary;

export const FIELDS: { key: FieldKey; header: string }[] = [
  { key: "salary", header: t("الراتب", "Salary") },
  { key: "compensation", header: t("التعويضات", "Compensation") },
  { key: "total", header: t("الإجمالي", "Gross") },
  { key: "social_security", header: t("التأمينات الاجتماعية", "Social security") },
  { key: "salary_tax", header: t("ضريبة الراتب", "Salary tax") },
  { key: "compensation_tax", header: t("ضريبة التعويضات", "Compensation tax") },
  { key: "taxes", header: t("مجموع الضرائب", "Total taxes") },
  { key: "deductions", header: t("مجموع الاقتطاعات", "Total deductions") },
  { key: "net", header: t("الصافي", "Net") },
  { key: "compensation_ratio", header: t("نسبة التعويضات", "Compensation ratio") },
];

function makeSalary(
  salary: Decimal,
  compensation: Decimal,
  socialSecurity: Decimal,
  salaryTax: Decimal,
  compTax: Decimal,
): Salary {
  const total = salary.add(compensation);
  const taxes = salaryTax.add(compTax);
  const deductions = socialSecurity.add(taxes);
  return {
    salary,
    compensation,
    total,
    social_security: socialSecurity,
    salary_tax: salaryTax,
    compensation_tax: compTax,
    taxes,
    deductions,
    net: total.sub(deductions),
    // The share of the total paid as compensation; 0 when the total is 0.
    compensation_ratio: total.isZero() ? new Decimal(0) : compensation.div(total),
  };
}

function checkNotNegative(value: Decimal, name: string): void {
  if (value.lt(0)) throw new RuleError(`${name} must not be negative, got ${value}`);
}

/** Taxes and net of a gross salary; social security only when `rules` include it, on `insuredSalary` (default: salary). */
export function calculateGross(
  rules: TaxRules,
  salary: Decimal,
  compensation: Decimal = new Decimal(0),
  insuredSalary?: Decimal | null,
): Salary {
  checkNotNegative(salary, "salary");
  checkNotNegative(compensation, "compensation");
  const b = salaryBreakdown(rules, salary, insuredSalary);
  return makeSalary(salary, compensation, b.socialSecurity, b.tax, compensationTax(rules, compensation));
}

/** Gross salary and compensation that pay at least `net`; `compensationShare` of it as compensation. */
export function calculateNet(
  rules: TaxRules,
  net: Decimal,
  compensationShare: Decimal = new Decimal(0),
  insuredSalary?: Decimal | null,
): Salary {
  const pkg = splitNetPackage(rules, net, compensationShare, insuredSalary);
  return calculateGross(rules, pkg.salary, pkg.compensation, insuredSalary);
}

export function calculateNetRange(rules: TaxRules, nets: Decimal[], compensationShare?: Decimal, insuredSalary?: Decimal | null): Salary[] {
  return nets.map((net) => calculateNet(rules, net, compensationShare, insuredSalary));
}

/** The same salary with social security (per `rules`, on `insuredSalary`, default: salary) cut from its net; taxes stay as they were. */
export function cutSocialSecurity(rules: TaxRules, s: Salary, insuredSalary?: Decimal | null): Salary {
  const ss = socialSecurityDeduction(rules, insuredSalary ?? s.salary);
  return makeSalary(s.salary, s.compensation, ss, s.salary_tax, s.compensation_tax);
}

export class RangeTooBigError extends RuleError {
  constructor(
    readonly size: number,
    readonly maxSize: number,
  ) {
    super(`the range has ${size} amounts but at most ${maxSize} are allowed`);
  }
}

/** Amounts from start to stop (inclusive) every step; stop defaults to start*stopFactor, step to start/stepDivisor. */
export function amountRange(
  start: Decimal,
  stop: Decimal | null,
  step: Decimal | null,
  { maxSize, stopFactor, stepDivisor }: { maxSize: number; stopFactor: Decimal; stepDivisor: Decimal },
): Decimal[] {
  const end = stop ?? start.mul(stopFactor);
  const gap = step ?? start.div(stepDivisor);
  if (gap.lte(0)) throw new RuleError(`step must be greater than 0, got ${gap}`);
  if (end.lt(start)) throw new RuleError(`stop (${end}) must not be less than start (${start})`);

  const size = end.sub(start).div(gap).toDecimalPlaces(0, Decimal.ROUND_DOWN).toNumber() + 1;
  if (size > maxSize) throw new RangeTooBigError(size, maxSize);
  return Array.from({ length: size }, (_, i) => start.add(gap.mul(i)));
}

/** Whole amounts as integers and anything else as a float, like the CLI's JSON. */
export function toRecord(s: Salary): Record<FieldKey, number> {
  return Object.fromEntries(FIELDS.map(({ key }) => [key, s[key].toNumber()])) as Record<FieldKey, number>;
}
