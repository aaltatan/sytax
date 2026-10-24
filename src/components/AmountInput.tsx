import { useId, useLayoutEffect, useRef } from "react";
import { Decimal } from "../core/taxes";
import { groupDigits, parseAmount } from "../lib/amount";
import { t } from "../lib/i18n";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  placeholder?: string;
  hint?: string;
  /** Marks a setting that differs from the defaults. */
  changed?: boolean;
  /** Shows − and + buttons that move the amount by this much. */
  step?: string;
  /** Upper limit for the − and + buttons. */
  max?: string;
  /** Unit shown inside the field, such as `%`. */
  suffix?: string;
}

const StepButton = ({ label, path, onClick }: { label: string; path: string; onClick: () => void }) => (
  <button type="button" aria-label={label} className="field flex w-11 shrink-0 items-center justify-center px-0 text-on-ground" onClick={onClick}>
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d={path} />
    </svg>
  </button>
);

export default function AmountInput({ label, value, onChange, error, placeholder, hint, changed, step, max, suffix }: Props) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  // Digits before the caret, to put it back after commas are added or removed.
  const caret = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = input.current;
    if (!el || caret.current === null) return;
    let pos = 0;
    for (let digits = 0; pos < el.value.length && digits < caret.current; pos++) if (el.value[pos] !== ",") digits++;
    el.setSelectionRange(pos, pos);
    caret.current = null;
  });

  const change = (text: string, caretAt: number | null) => {
    if (caretAt !== null) caret.current = text.slice(0, caretAt).replace(/,/g, "").length;
    onChange(text.replace(/,/g, ""));
  };
  const nudge = (sign: 1 | -1) => {
    const now = parseAmount(value) ?? parseAmount(placeholder ?? "") ?? new Decimal(0);
    const next = Decimal.max(now.plus(parseAmount(step!)!.mul(sign)), 0);
    onChange((max ? Decimal.min(next, parseAmount(max)!) : next).toString());
  };

  const box = (
    <input
      ref={input}
      id={id}
      className={`field ${suffix ? "pr-8" : ""}`}
      dir="ltr"
      inputMode="decimal"
      autoComplete="off"
      value={groupDigits(value)}
      placeholder={placeholder && groupDigits(placeholder)}
      aria-invalid={!!error}
      aria-describedby={error || hint ? `${id}-note` : undefined}
      onChange={(e) => change(e.target.value, e.target.selectionStart)}
    />
  );
  const field = suffix ? (
    <div dir="ltr" className="relative min-w-0 flex-1">
      {box}
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted">{suffix}</span>
    </div>
  ) : (
    box
  );

  return (
    <div>
      <label htmlFor={id} className={`label ${error ? "text-red-600" : ""}`}>
        {label}
        {changed && <span className="ms-1 inline-block size-2 rounded-full bg-barley-corn-500" title={t("معدّل عن القانون", "Changed from the law")} />}
      </label>
      {step && parseAmount(step) ? (
        // Left to right in both languages, so − sits at the left like on a number line.
        <div dir="ltr" className="flex gap-1">
          <StepButton label={`${t("إنقاص", "Decrease")} ${label}`} path="M5 12h14" onClick={() => nudge(-1)} />
          {field}
          <StepButton label={`${t("زيادة", "Increase")} ${label}`} path="M12 5v14M5 12h14" onClick={() => nudge(1)} />
        </div>
      ) : (
        field
      )}
      {(error || hint) && (
        <span id={`${id}-note`} className={`mt-1 block text-sm ${error ? "text-red-600" : "text-muted"}`}>
          {error || hint}
        </span>
      )}
    </div>
  );
}
