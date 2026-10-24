// The settings model (port of syriantaxescli core/settings.py), saved in the browser.
import { parseAmount } from "../lib/amount";
import { t } from "../lib/i18n";
import { DEFAULT_NAME, defaultSettings } from "./defaults";
import {
  checkRules,
  Decimal,
  roundTo,
  ROUNDING_METHODS,
  RuleError,
  type RoundingMethod,
  type TaxRules,
} from "./taxes";

export interface RoundingSettings {
  method: RoundingMethod;
  step: string;
}

export interface Settings {
  tax: {
    brackets: { lower: string; rate: string }[];
    min_salary: string;
    compensation_tax_rate: string;
    rounding: RoundingSettings;
    /** Own rounding for the salary tax: of each bracket's part ("each") or of their sum ("total"). */
    bracket_rounding: RoundingSettings & { enabled: boolean; mode: "each" | "total" };
    /** insured_salary fills the calculators' social security salary; empty means the base salary. */
    social_security: { enabled: boolean; rate: string; min_salary: string; insured_salary: string; rounding: RoundingSettings };
  };
  net: { compensation_share: string };
  /** slider_max is the end of the salary scale slider. */
  range: { max_size: number; stop_factor: string; step_divisor: string; slider_max: string };
  /** Example values shown in the empty calculator fields. */
  placeholders: { salary: string; compensation: string; net: string; start: string; share: string };
  /** How much the calculators' − and + buttons move an amount. */
  input: { step: string; share_step: string };
}

/** Problems keyed by setting path, e.g. "tax.brackets.1.rate". Empty when the settings are valid. */
export type Problems = Record<string, string>;

const CONFIGS_KEY = "sytax.configs";
const OLD_STORAGE_KEY = "sytax.settings"; // one unnamed config, before named configs existed

/** Accept `half_up`, `HALF_UP` and `ROUND_HALF_UP` alike. */
export function cleanMethod(value: string): RoundingMethod | null {
  const method = value.trim().toUpperCase().replace(/^ROUND_/, "") as RoundingMethod;
  return ROUNDING_METHODS.includes(method) ? method : null;
}

export function validate(s: Settings): Problems {
  const problems: Problems = {};
  const num = (path: string, value: string, check: (d: Decimal) => string | null) => {
    const d = parseAmount(value);
    const problem = d === null ? t("ليس رقماً صحيحاً", "Not a valid number") : check(d);
    if (problem) problems[path] = problem;
  };
  const amount = (d: Decimal) => (d.lt(0) ? t("يجب ألا يكون سالباً", "Must not be negative") : null);
  const rate = (d: Decimal) => (d.lt(0) || d.gte(1) ? t("يجب أن تكون بين 0 وأقل من 1", "Must be from 0 to less than 1") : null);
  const positive = (d: Decimal) => (d.lte(0) ? t("يجب أن يكون أكبر من 0", "Must be greater than 0") : null);
  const rounding = (path: string, r: RoundingSettings) => {
    if (!cleanMethod(r.method)) problems[`${path}.method`] = t("طريقة تقريب غير معروفة", "Unknown rounding method");
    num(`${path}.step`, r.step, positive);
  };

  const { tax } = s;
  if (!tax.brackets.length) problems["tax.brackets"] = t("يجب أن تكون هناك شريحة واحدة على الأقل", "There must be at least one bracket");
  tax.brackets.forEach((b, i) => {
    num(`tax.brackets.${i}.lower`, b.lower, amount);
    num(`tax.brackets.${i}.rate`, b.rate, rate);
  });
  num("tax.min_salary", tax.min_salary, amount);
  num("tax.compensation_tax_rate", tax.compensation_tax_rate, rate);
  rounding("tax.rounding", tax.rounding);
  rounding("tax.bracket_rounding", tax.bracket_rounding);
  if (!["each", "total"].includes(tax.bracket_rounding.mode)) problems["tax.bracket_rounding.mode"] = t("طريقة تقريب غير معروفة", "Unknown rounding method");
  num("tax.social_security.rate", tax.social_security.rate, rate);
  num("tax.social_security.min_salary", tax.social_security.min_salary, amount);
  if (tax.social_security.insured_salary.trim()) num("tax.social_security.insured_salary", tax.social_security.insured_salary, amount);
  rounding("tax.social_security.rounding", tax.social_security.rounding);
  num("net.compensation_share", s.net.compensation_share, (d) =>
    d.lt(0) || d.gt(1) ? t("يجب أن تكون بين 0 و 1", "Must be between 0 and 1") : null,
  );
  if (!Number.isInteger(s.range.max_size) || s.range.max_size <= 0) {
    problems["range.max_size"] = t("يجب أن يكون عدداً صحيحاً أكبر من 0", "Must be a whole number greater than 0");
  }
  num("range.stop_factor", s.range.stop_factor, positive);
  num("range.step_divisor", s.range.step_divisor, positive);
  num("range.slider_max", s.range.slider_max, positive);
  num("input.step", s.input.step, positive);
  num("input.share_step", s.input.share_step, positive);

  if (!Object.keys(problems).length) {
    try {
      toRules(s); // syriantaxes checks the brackets' order
    } catch (e) {
      if (!(e instanceof RuleError)) throw e;
      problems["tax.brackets"] = e.message.includes("start with")
        ? t("يجب أن تبدأ الشرائح بشريحة حدها الأدنى 0", "The first bracket must start at 0")
        : t("يجب أن تكون الحدود الدنيا للشرائح متزايدة تماماً", "Bracket lower limits must strictly increase");
    }
  }
  return problems;
}

const dec = (value: string) => parseAmount(value)!;
const rule = (r: RoundingSettings) => roundTo(dec(r.step), cleanMethod(r.method)!);

/** Build the rules; `socialSecurity` overrides whether it is deducted. Settings must be valid. */
export function toRules(s: Settings, socialSecurity?: boolean): TaxRules {
  const { tax } = s;
  const ss = tax.social_security;
  const br = tax.bracket_rounding;
  return checkRules({
    brackets: tax.brackets.map((b) => ({ lower: dec(b.lower), rate: dec(b.rate) })),
    minSalary: dec(tax.min_salary),
    compensationTaxRate: dec(tax.compensation_tax_rate),
    socialSecurity:
      (socialSecurity ?? ss.enabled)
        ? { rate: dec(ss.rate), minSalary: dec(ss.min_salary), rounding: rule(ss.rounding) }
        : null,
    rounding: rule(tax.rounding),
    bracketRounding: br.enabled && br.mode === "each" ? rule(br) : null,
    salaryTaxRounding: br.enabled && br.mode === "total" ? rule(br) : null,
  });
}

/** The user's named configs and the one in use. */
export interface Configs {
  active: string;
  configs: Record<string, Settings>;
}

/** A saved config filled with fields added since it was saved, or null when it can't be used. */
function usable(s: Settings | null | undefined): Settings | null {
  try {
    if (!s) return null;
    delete (s as { preset?: string }).preset; // saved before the law presets were dropped
    s.tax.bracket_rounding ??= defaultSettings().tax.bracket_rounding;
    s.tax.bracket_rounding.mode ??= "each"; // saved before the mode existed
    s.placeholders ??= defaultSettings().placeholders;
    s.input ??= defaultSettings().input; // saved before the − and + buttons existed
    s.input.share_step ??= defaultSettings().input.share_step; // saved before the share had its own step
    s.range.slider_max ??= defaultSettings().range.slider_max; // saved before the slider existed
    s.tax.social_security.insured_salary ??= ""; // saved before it existed: keep insuring the base salary
    return Object.keys(validate(s)).length ? null : s;
  } catch {
    return null;
  }
}

/** The usable configs in saved or exported JSON, or null when there are none. Throws on malformed JSON. */
export function parseConfigs(json: string): Configs | null {
  const saved = JSON.parse(json) as Configs | null;
  const configs: Record<string, Settings> = {};
  for (const [name, s] of Object.entries(saved?.configs ?? {})) {
    const config = name !== "__proto__" && name.trim() ? usable(s) : null;
    if (config) configs[name] = config;
  }
  const names = Object.keys(configs);
  return names.length ? { active: Object.hasOwn(configs, saved!.active) ? saved!.active : names[0], configs } : null;
}

/** Saved configs, else settings saved before configs existed, else the built-in defaults. */
export function loadConfigs(): Configs {
  try {
    const saved = parseConfigs(localStorage.getItem(CONFIGS_KEY) ?? "null");
    if (saved) return saved;
    const old = usable(JSON.parse(localStorage.getItem(OLD_STORAGE_KEY) ?? "null"));
    if (old) return { active: DEFAULT_NAME, configs: { [DEFAULT_NAME]: old } };
  } catch {
    // unreadable or blocked storage: fall back to the defaults
  }
  return { active: DEFAULT_NAME, configs: { [DEFAULT_NAME]: defaultSettings() } };
}

export function saveConfigs(c: Configs): void {
  try {
    localStorage.setItem(CONFIGS_KEY, JSON.stringify(c));
  } catch {
    // private mode: configs last for this visit only
  }
}
