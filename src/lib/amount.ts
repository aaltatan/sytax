import { Decimal } from "../core/taxes";
import { lang } from "./i18n";

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

/** Read `1000000`, `1,000,000`, `1_000_000`, `1e6` or Arabic-Indic digits; null if not a number. */
export function parseAmount(text: string): Decimal | null {
  const clean = text
    .trim()
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[,_\s٬]/g, "")
    .replace("٫", ".");
  return NUMBER.test(clean) ? new Decimal(clean) : null;
}

/** `12560.5` as `12,560.5` while typing; anything else (Arabic digits, `1e6`) is left as typed. */
export const groupDigits = (text: string) =>
  /^-?\d+(\.\d*)?$/.test(text) ? text.replace(/^-?\d+/, (int) => int.replace(/\B(?=(\d{3})+$)/g, ",")) : text;

/** A percentage text (`25`) as a share (0.25); empty is 0. */
export function parseShare(text: string): Decimal | null {
  if (!text.trim()) return new Decimal(0);
  const percent = parseAmount(text);
  return percent && percent.div(100);
}

/** A share (`0.25`) as a percentage text (`25`). */
export const shareText = (share: string) => new Decimal(share).mul(100).toString();

const locale = lang === "en" ? "en" : "ar-SY-u-nu-latn";
const amountFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
const percentFormat = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 });

export const formatAmount = (value: Decimal) => amountFormat.format(value.toNumber());
export const formatPercent = (value: Decimal) => percentFormat.format(value.toNumber());
