import { useState } from "react";
import AmountInput from "../components/AmountInput";
import ResultCard from "../components/ResultCard";
import Toggle from "../components/Toggle";
import { calculateGross } from "../core/services";
import { toRules, type Settings } from "../core/settings";
import { Decimal } from "../core/taxes";
import { formatAmount, parseAmount } from "../lib/amount";
import { attempt, notANumber } from "../lib/errors";
import { t } from "../lib/i18n";

export default function Gross({ settings }: { settings: Settings }) {
  const [salary, setSalary] = useState("");
  const [compensation, setCompensation] = useState("");
  const [ss, setSs] = useState(settings.tax.social_security.enabled);
  const [insured, setInsured] = useState(settings.tax.social_security.insured_salary);

  const s = parseAmount(salary);
  const c = compensation.trim() ? parseAmount(compensation) : new Decimal(0);
  const i = insured.trim() ? parseAmount(insured) : null;

  const outcome =
    s && c && !notANumber(insured, i) ? attempt(() => calculateGross(toRules(settings, ss), s, c, ss ? i : null)) : null;

  return (
    <div className="space-y-3 md:grid md:grid-cols-[20rem_minmax(0,40rem)] md:items-start md:gap-4 md:space-y-0">
      <section className="card">
        <h2 className="text-lg font-bold">{t("من الإجمالي إلى الصافي", "Gross to net")}</h2>
        <AmountInput step={settings.input.step} label={t("الراتب المقطوع", "Base salary")} value={salary} onChange={setSalary} placeholder={settings.placeholders.salary} error={notANumber(salary, s)} />
        <AmountInput step={settings.input.step} label={t("التعويضات", "Compensation")} value={compensation} onChange={setCompensation} placeholder={settings.placeholders.compensation} error={notANumber(compensation, c)} />
        <Toggle label={t("مشترك في التأمينات الاجتماعية", "Pays social security")} checked={ss} onChange={setSs} />
        {ss && (
          <AmountInput step={settings.input.step}
            label={t("راتب التأمينات الاجتماعية", "Social security salary")}
            value={insured}
            onChange={setInsured}
            placeholder={salary || t("الراتب المقطوع", "Base salary")}
            hint={`${t("يُترك فارغاً ليُحسب على الراتب المقطوع؛ الحد الأدنى", "Leave empty to use the base salary; minimum")} ${formatAmount(parseAmount(settings.tax.social_security.min_salary)!)}`}
            error={notANumber(insured, i)}
          />
        )}
        {outcome?.error && <p className="text-red-600" role="alert">{outcome.error}</p>}
      </section>
      {outcome?.value && <ResultCard salary={outcome.value} name="sytax-gross" settings={settings} />}
    </div>
  );
}
