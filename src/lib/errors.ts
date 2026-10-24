import { RangeTooBigError } from "../core/services";
import { InsuredBelowMinimumError, RuleError, SalaryBelowMinimumError } from "../core/taxes";
import { formatAmount } from "./amount";
import { t } from "./i18n";

export type Outcome<T> = { value: T; error?: undefined } | { value?: undefined; error: string };

export function attempt<T>(run: () => T): Outcome<T> {
  try {
    return { value: run() };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

/** The field's problem when it holds text that is not a number. */
export const notANumber = (text: string, parsed: unknown) => (text.trim() && parsed === null ? t("ليس رقماً صحيحاً", "Not a valid number") : null);

/** User-facing message for a calculation error; anything that is not a rule error is a bug and is rethrown. */
export function errorMessage(e: unknown): string {
  if (e instanceof SalaryBelowMinimumError) {
    const min = formatAmount(e.minSalary);
    return t(`لا يمكن الحساب لصافي أقل من الحد الأدنى للراتب ${min}`, `Can't calculate a net below the minimum salary ${min}`);
  }
  if (e instanceof InsuredBelowMinimumError) {
    const min = formatAmount(e.minSalary);
    return t(`يجب ألا يقل راتب التأمينات الاجتماعية عن ${min}`, `The social security salary must be at least ${min}`);
  }
  if (e instanceof RangeTooBigError) {
    const [size, max] = [e.size.toLocaleString("en"), e.maxSize.toLocaleString("en")];
    return t(`السلّم فيه ${size} قيمة والحد الأقصى ${max}؛ كبّر الفاصل أو صغّر المجال`, `The scale has ${size} amounts but at most ${max} are allowed; widen the step or narrow the range`);
  }
  if (e instanceof RuleError) {
    if (e.message.startsWith("stop")) return t("يجب ألا تكون النهاية أقل من البداية", "The end must not be less than the start");
    if (e.message.startsWith("step")) return t("يجب أن يكون الفاصل أكبر من 0", "The step must be greater than 0");
    if (e.message.includes("negative")) return t("يجب ألا تكون المبالغ سالبة", "Amounts must not be negative");
    return e.message;
  }
  throw e;
}
