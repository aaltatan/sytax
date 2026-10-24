import { t } from "../lib/i18n";
import AmountInput from "./AmountInput";

/** Compensation share as a percentage of the net; empty means 0. */
export default function ShareInput({ value, onChange, error, placeholder, step }: { value: string; onChange: (v: string) => void; error?: string | null; placeholder: string; step: string }) {
  return (
    <AmountInput
      label={t("نسبة التعويضات من الصافي", "Compensation share of net")}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      hint={t("ما يُدفع تعويضاتٍ والباقي راتباً", "Paid as compensation; the rest as salary")}
      error={error}
      step={step}
      max="100"
      suffix="%"
    />
  );
}
