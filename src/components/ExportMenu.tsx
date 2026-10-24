import { exportSalaries, FORMATS } from "../core/export";
import type { Salary } from "../core/services";
import type { Settings } from "../core/settings";
import { t } from "../lib/i18n";

// taxOnFullSalary: salary tax was taken before social security was cut (see exportSalaries).
export default function ExportMenu(props: { salaries: Salary[]; name: string; settings: Settings; taxOnFullSalary?: boolean }) {
  const { salaries, name, settings, taxOnFullSalary } = props;
  return (
    <div>
      <span className="label">{t("تصدير", "Export")}</span>
      <div className="grid grid-cols-4 gap-2">
        {FORMATS.map((format) => (
          <button key={format} type="button" className="btn-secondary text-sm" onClick={() => exportSalaries(salaries, name, format, settings, taxOnFullSalary)}>
            {format}
          </button>
        ))}
      </div>
    </div>
  );
}
