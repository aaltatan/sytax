import { FIELDS, type Salary } from "../core/services";
import type { Settings } from "../core/settings";
import { formatAmount, formatPercent } from "../lib/amount";
import { t } from "../lib/i18n";
import ExportMenu from "./ExportMenu";

// Totals get a rule above them, like the payslip in taxes-calculator.
const TOTALS = new Set(["total", "deductions"]);

export default function ResultCard({ salary, name, settings }: { salary: Salary; name: string; settings: Settings }) {
  return (
    <section className="card" aria-live="polite">
      <dl className="space-y-1 font-bold tracking-tight">
        {FIELDS.filter((f) => f.key !== "net").map((f) => (
          <div key={f.key} className={`flex justify-between gap-2 ${TOTALS.has(f.key) ? "border-t border-ink/20 pt-1" : ""}`}>
            <dt className="font-medium">{f.header}</dt>
            <dd dir="ltr">{f.key === "compensation_ratio" ? formatPercent(salary[f.key]) : formatAmount(salary[f.key])}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-2 border-t-4 border-double border-ink pt-1 text-lg">
          <dt>{t("الصافي", "Net")}</dt>
          <dd dir="ltr">{formatAmount(salary.net)}</dd>
        </div>
      </dl>
      <ExportMenu salaries={[salary]} name={name} settings={settings} />
    </section>
  );
}
