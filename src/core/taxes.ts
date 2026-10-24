// Port of the `syriantaxes` Python library (1.x): brackets, rounding, salary and compensation tax.
import { Decimal as BaseDecimal } from "decimal.js";

// Python's default decimal context: 28 significant digits, banker's rounding.
export const Decimal = BaseDecimal.clone({ precision: 28, rounding: BaseDecimal.ROUND_HALF_EVEN });
export type Decimal = BaseDecimal;

const ZERO = new Decimal(0);

/** Rounds to a multiple of step; step bounds how far a rounded amount can be off. */
export type Rounding = ((amount: Decimal) => Decimal) & { step: Decimal };

export const ROUNDING_METHODS = [
  "CEILING",
  "FLOOR",
  "UP",
  "DOWN",
  "HALF_UP",
  "HALF_DOWN",
  "HALF_EVEN",
  "05UP",
] as const;
export type RoundingMethod = (typeof ROUNDING_METHODS)[number];

const MODES: Record<Exclude<RoundingMethod, "05UP">, BaseDecimal.Rounding> = {
  CEILING: Decimal.ROUND_CEIL,
  FLOOR: Decimal.ROUND_FLOOR,
  UP: Decimal.ROUND_UP,
  DOWN: Decimal.ROUND_DOWN,
  HALF_UP: Decimal.ROUND_HALF_UP,
  HALF_DOWN: Decimal.ROUND_HALF_DOWN,
  HALF_EVEN: Decimal.ROUND_HALF_EVEN,
};

export class RuleError extends Error {}

export class SalaryBelowMinimumError extends RuleError {
  constructor(readonly minSalary: Decimal) {
    super(`Can't be calculated for salary less than ${minSalary}.`);
  }
}

export class InsuredBelowMinimumError extends RuleError {
  constructor(readonly minSalary: Decimal) {
    super(`insured salary must be at least ${minSalary}`);
  }
}

function toIntegral(value: Decimal, method: RoundingMethod): Decimal {
  if (method !== "05UP") return value.toDecimalPlaces(0, MODES[method]);
  // ROUND_05UP: towards zero, unless that leaves a last digit of 0 or 5, then away from zero.
  const down = value.toDecimalPlaces(0, Decimal.ROUND_DOWN);
  if (down.eq(value)) return down;
  const last = down.abs().mod(10).toNumber();
  return last === 0 || last === 5 ? value.toDecimalPlaces(0, Decimal.ROUND_UP) : down;
}

/** Make a rounding function to the nearest multiple of step. */
export function roundTo(step: Decimal, method: RoundingMethod = "HALF_EVEN"): Rounding {
  if (step.lte(0)) throw new RuleError(`step must be > 0, got ${step}`);
  return Object.assign((amount: Decimal) => toIntegral(amount.div(step), method).mul(step), { step });
}

export const toCents = roundTo(new Decimal("0.01"));

/** A tax band from lower up to the next bracket's lower (the last one has no top). */
export interface Bracket {
  lower: Decimal;
  rate: Decimal;
}

export interface SocialSecurity {
  rate: Decimal;
  minSalary: Decimal;
  rounding: Rounding;
}

export interface TaxRules {
  brackets: Bracket[];
  minSalary: Decimal;
  compensationTaxRate: Decimal;
  socialSecurity: SocialSecurity | null;
  rounding: Rounding;
  /** Rounds each bracket's part of the tax before they are added up; absent means only the total is rounded. */
  bracketRounding?: Rounding | null;
  /** Rounds the salary tax total instead of `rounding`, which then rounds only the compensation tax. */
  salaryTaxRounding?: Rounding | null;
}

function checkRate(rate: Decimal, name: string): void {
  // A rate of 1 or more would leave nothing after tax, so no gross could be found.
  if (rate.lt(0) || rate.gte(1)) throw new RuleError(`${name} must be at least 0 and below 1, got ${rate}`);
}

function checkNotNegative(value: Decimal, name: string): void {
  if (value.lt(0)) throw new RuleError(`${name} must be >= 0, got ${value}`);
}

/** Check rules the way syriantaxes' dataclasses do on construction. */
export function checkRules(rules: TaxRules): TaxRules {
  const lowers = rules.brackets.map((b) => b.lower);
  rules.brackets.forEach((b) => {
    checkNotNegative(b.lower, "lower");
    checkRate(b.rate, "rate");
  });
  if (!lowers.length || !lowers[0].eq(0)) {
    throw new RuleError("brackets must start with a bracket whose lower is 0");
  }
  if (lowers.some((lower, i) => i > 0 && lowers[i - 1].gte(lower))) {
    throw new RuleError("brackets must be in strictly increasing order of lower");
  }
  checkNotNegative(rules.minSalary, "min_salary");
  checkRate(rules.compensationTaxRate, "compensation_tax_rate");
  if (rules.socialSecurity) {
    checkRate(rules.socialSecurity.rate, "rate");
    checkNotNegative(rules.socialSecurity.minSalary, "min_salary");
  }
  return rules;
}

// --------------------
// Compensation
// --------------------

/** Flat tax on a compensation amount. */
export function compensationTax(rules: TaxRules, amount: Decimal): Decimal {
  return rules.rounding(amount.mul(rules.compensationTaxRate));
}

/** The smallest whole compensation that leaves at least net after the flat compensation tax. */
export function grossCompensation(rules: TaxRules, net: Decimal): Decimal {
  // As in grossSalary: rounding the tax down gives back up to one step, so start below the exact answer.
  const exact = net.sub(rules.rounding.step).div(new Decimal(1).sub(rules.compensationTaxRate));
  let gross = Decimal.max(exact.toDecimalPlaces(0, Decimal.ROUND_FLOOR), ZERO);
  while (gross.sub(compensationTax(rules, gross)).lt(net)) gross = gross.add(1);
  return gross;
}

// --------------------
// Salary
// --------------------

export interface SalaryBreakdown {
  gross: Decimal;
  socialSecurity: Decimal;
  taxable: Decimal;
  tax: Decimal;
  net: Decimal;
}

export function socialSecurityDeduction(rules: TaxRules, insuredSalary: Decimal): Decimal {
  const ss = rules.socialSecurity;
  if (!ss) return ZERO;
  if (insuredSalary.lt(ss.minSalary)) throw new InsuredBelowMinimumError(ss.minSalary);
  return ss.rounding(insuredSalary.mul(ss.rate));
}

/** Social security, taxable salary, tax and net; social security is based on insured (default: gross). */
export function salaryBreakdown(rules: TaxRules, gross: Decimal, insuredSalary?: Decimal | null): SalaryBreakdown {
  const socialSecurity = socialSecurityDeduction(rules, insuredSalary ?? gross);
  const taxable = gross.sub(socialSecurity);
  const tax = (rules.salaryTaxRounding ?? rules.rounding)(bracketTax(rules.brackets, taxable, rules.bracketRounding ?? undefined));
  return { gross, socialSecurity, taxable, tax, net: gross.sub(socialSecurity).sub(tax) };
}

/** The smallest whole gross whose net is at least net; social security is on insured (default: the gross itself). */
export function grossSalary(rules: TaxRules, net: Decimal, insuredSalary?: Decimal | null): Decimal {
  if (net.lt(rules.minSalary)) throw new SalaryBelowMinimumError(rules.minSalary);

  // Rounding can lower the deductions by up to its steps, so the answer may sit below the exact unrounded
  // gross: start from the gross that pays net minus the most rounding can give back, and count up.
  const roundings = [rules.salaryTaxRounding ?? rules.rounding, rules.socialSecurity?.rounding];
  if (rules.bracketRounding) roundings.push(...rules.brackets.map(() => rules.bracketRounding!));
  const slack = roundings.reduce((sum, r) => sum.add(r?.step ?? ZERO), ZERO);
  const start = insuredSalary
    ? // A fixed insured salary makes social security a constant: gross is the taxable salary plus it.
      taxableForNet(rules.brackets, net.sub(slack)).add(socialSecurityDeduction(rules, insuredSalary))
    : unroundedGross(rules, net.sub(slack));
  let gross = Decimal.max(
    start.toDecimalPlaces(0, Decimal.ROUND_FLOOR),
    insuredSalary ? ZERO : (rules.socialSecurity?.minSalary.toDecimalPlaces(0, Decimal.ROUND_CEIL) ?? ZERO),
  );
  while (salaryBreakdown(rules, gross, insuredSalary).net.lt(net)) gross = gross.add(1);
  return gross;
}

function unroundedGross(rules: TaxRules, net: Decimal): Decimal {
  const ssRate = rules.socialSecurity?.rate ?? ZERO;
  return taxableForNet(rules.brackets, net).div(new Decimal(1).sub(ssRate));
}

type Band = [Bracket, Decimal | null];

/** Pair each bracket with its upper limit: the next bracket's lower, or null for the last. */
function bands(brackets: Bracket[]): Band[] {
  return brackets.map((bracket, i) => [bracket, brackets[i + 1]?.lower ?? null]);
}

/** Progressive tax on taxable, before the total is rounded; `round` applies to each bracket's part. */
function bracketTax(brackets: Bracket[], taxable: Decimal, round: (part: Decimal) => Decimal = (part) => part): Decimal {
  return bands(brackets).reduce((sum, [bracket, upper]) => {
    const top = upper === null ? taxable : Decimal.min(taxable, upper);
    return sum.add(round(bracket.rate.mul(Decimal.max(top.sub(bracket.lower), ZERO))));
  }, ZERO);
}

/** Solve taxable - tax(taxable) == net, without rounding: a straight line within one band. */
function taxableForNet(brackets: Bracket[], net: Decimal): Decimal {
  const [bracket] = bands(brackets).find(
    ([, upper]) => upper === null || net.lte(upper.sub(bracketTax(brackets, upper))),
  )!;
  const netAtLower = bracket.lower.sub(bracketTax(brackets, bracket.lower));
  return bracket.lower.add(net.sub(netAtLower).div(new Decimal(1).sub(bracket.rate)));
}

// --------------------
// Package
// --------------------

export interface Package {
  salary: Decimal;
  compensation: Decimal;
}

/**
 * Split a wanted net total into a gross salary and a gross compensation. If the salary part would
 * fall below the minimum salary, the salary is the minimum and the compensation makes up the rest.
 */
export function splitNetPackage(rules: TaxRules, netTotal: Decimal, compensationShare: Decimal, insuredSalary?: Decimal | null): Package {
  if (compensationShare.lt(0) || compensationShare.gt(1)) {
    throw new RuleError(`compensation_share must be between 0 and 1, got ${compensationShare}`);
  }
  if (netTotal.lt(rules.minSalary)) throw new SalaryBelowMinimumError(rules.minSalary);

  const netSalary = netTotal.mul(new Decimal(1).sub(compensationShare)).toDecimalPlaces(0, Decimal.ROUND_DOWN);

  let salary: Decimal;
  let netCompensation: Decimal;
  if (netSalary.lt(rules.minSalary)) {
    salary = rules.minSalary;
    netCompensation = netTotal.sub(salaryBreakdown(rules, salary, insuredSalary).net);
  } else {
    salary = grossSalary(rules, netSalary, insuredSalary);
    netCompensation = netTotal.sub(netSalary);
  }
  return { salary, compensation: grossCompensation(rules, netCompensation) };
}
