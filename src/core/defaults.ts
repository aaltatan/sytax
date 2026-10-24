// Built-in rules (syriantaxescli's presets/syria-2024.toml): the base for new configs and what "reset" restores.
// Amounts are strings so they reach Decimal without float drift.
import { t } from "../lib/i18n";
import type { Settings } from "./settings";

const DEFAULTS: Settings = {
  tax: {
    // Net targets below the minimum salary can't be calculated.
    min_salary: "12560",
    compensation_tax_rate: "0.05",
    rounding: { method: "HALF_UP", step: "1" },
    // Off: the law rounds only the total salary tax.
    bracket_rounding: { enabled: false, mode: "each", method: "HALF_UP", step: "1" },
    brackets: [
      { lower: "0", rate: "0" },
      { lower: "12560", rate: "0.15" },
    ],
    social_security: {
      enabled: false,
      rate: "0.07",
      min_salary: "12560",
      // What the calculators fill the social security salary with; empty insures the base salary.
      insured_salary: "12560",
      rounding: { method: "HALF_UP", step: "1" },
    },
  },
  net: { compensation_share: "0" },
  range: { max_size: 1000, stop_factor: "10", step_divisor: "10", slider_max: "500000" },
  placeholders: { salary: "12560", compensation: "0", net: "15000", start: "15000", share: "0" },
  input: { step: "50", share_step: "5" },
};

export const DEFAULT_NAME = t("الإعداد الافتراضي", "Default config");

export const defaultSettings = (): Settings => structuredClone(DEFAULTS);
