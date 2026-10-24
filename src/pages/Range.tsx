import { useState } from "react";
import AmountInput from "../components/AmountInput";
import ExportMenu from "../components/ExportMenu";
import ShareInput from "../components/ShareInput";
import Toggle from "../components/Toggle";
import {
  amountRange,
  calculateNetRange,
  cutSocialSecurity,
  FIELDS,
} from "../core/services";
import { toRules, type Settings } from "../core/settings";
import { Decimal } from "../core/taxes";
import {
  formatAmount,
  formatPercent,
  parseAmount,
  parseShare,
  shareText,
} from "../lib/amount";
import { attempt, notANumber } from "../lib/errors";
import { t } from "../lib/i18n";

export default function Range({ settings }: { settings: Settings }) {
  const [start, setStart] = useState("");
  const [stop, setStop] = useState("");
  const [step, setStep] = useState("");
  const [share, setShare] = useState(() =>
    shareText(settings.net.compensation_share),
  );
  const [ss, setSs] = useState(settings.tax.social_security.enabled);
  const [ssMode, setSsMode] = useState<"include" | "cut">("include");

  const a = parseAmount(start);
  const b = stop.trim() ? parseAmount(stop) : null;
  const c = step.trim() ? parseAmount(step) : null;
  const r = parseShare(share);
  const valid = a && r && !notANumber(stop, b) && !notANumber(step, c);

  const stopFactor = parseAmount(settings.range.stop_factor)!;
  const stepDivisor = parseAmount(settings.range.step_divisor)!;

  // The slider spans 0 to the configured end, widened when a typed amount goes past it.
  const lo = a?.toNumber() ?? 0;
  const hi = b?.toNumber() ?? (a ? a.mul(stopFactor).toNumber() : lo);
  const sliderMax = Math.max(
    parseAmount(settings.range.slider_max)!.toNumber(),
    lo,
    hi,
  );
  const sliderStep = parseAmount(settings.input.step)?.toNumber() || 1;

  const outcome = valid
    ? attempt(() => {
        const nets = amountRange(a, b, c, {
          maxSize: settings.range.max_size,
          stopFactor,
          stepDivisor,
        });
        const insured = parseAmount(
          settings.tax.social_security.insured_salary,
        );
        if (!ss) return calculateNetRange(toRules(settings, false), nets, r);
        if (ssMode === "include")
          return calculateNetRange(toRules(settings, true), nets, r, insured);
        // The gross pays the net as if there were no social security, then it is cut from that net.
        const withSs = toRules(settings, true);
        return calculateNetRange(toRules(settings, false), nets, r).map((s) =>
          cutSocialSecurity(withSs, s, insured),
        );
      })
    : null;

  return (
    <div className="space-y-3">
      <section className="card">
        <h2 className="text-lg font-bold">{t("سلّم رواتب", "Salary scale")}</h2>
        <p className="text-sm text-muted">
          {t(
            "الإجمالي لكل صافٍ من البداية إلى النهاية بفاصل ثابت.",
            "The gross for each net from start to end at a fixed step.",
          )}
        </p>
        <div
          dir="ltr"
          className="flex justify-between text-xs text-muted"
          aria-hidden
        >
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <span key={f}>{formatAmount(new Decimal(sliderMax).mul(f))}</span>
          ))}
        </div>
        <div dir="ltr" className="relative h-6">
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded bg-line" />
          <div
            className="absolute top-1/2 h-1 -translate-y-1/2 rounded bg-timber-green-700"
            style={{
              left: `${(lo / sliderMax) * 100}%`,
              right: `${100 - (hi / sliderMax) * 100}%`,
            }}
          />
          <input
            type="range"
            className="dual-range"
            aria-label={t("الصافي الأول", "First net")}
            min={0}
            max={sliderMax}
            step={sliderStep}
            value={lo}
            onChange={(e) => setStart(String(Math.min(+e.target.value, hi)))}
          />
          <input
            type="range"
            className="dual-range"
            aria-label={t("الصافي الأخير", "Last net")}
            min={0}
            max={sliderMax}
            step={sliderStep}
            value={hi}
            onChange={(e) => setStop(String(Math.max(+e.target.value, lo)))}
          />
        </div>
        <div className="grid lg:grid-cols-2 xl:grid-cols-4 gap-4">
          <AmountInput
            step={settings.input.step}
            label={t("الصافي الأول", "First net")}
            value={start}
            onChange={setStart}
            placeholder={settings.placeholders.start}
            error={notANumber(start, a)}
          />
          <AmountInput
            step={settings.input.step}
            label={t("الصافي الأخير", "Last net")}
            value={stop}
            onChange={setStop}
            placeholder={
              a
                ? formatAmount(a.mul(stopFactor))
                : `${t("البداية", "start")} × ${settings.range.stop_factor}`
            }
            error={notANumber(stop, b)}
          />
          <AmountInput
            step={settings.input.step}
            label={t("الفاصل", "Step")}
            value={step}
            onChange={setStep}
            placeholder={
              a
                ? formatAmount(a.div(stepDivisor))
                : `${t("البداية", "start")} ÷ ${settings.range.step_divisor}`
            }
            error={notANumber(step, c)}
          />
          <ShareInput
            step={settings.input.share_step}
            placeholder={settings.placeholders.share}
            value={share}
            onChange={setShare}
            error={notANumber(share, r)}
          />
        </div>
        <Toggle
          label={t("مشترك في التأمينات الاجتماعية", "Pays social security")}
          checked={ss}
          onChange={setSs}
        />
        {ss && (
          <div>
            <label className="label" htmlFor="range-ss-mode">
              {t("حساب الصافي", "Net calculation")}
            </label>
            <select
              id="range-ss-mode"
              className="field"
              value={ssMode}
              onChange={(e) => setSsMode(e.target.value as "include" | "cut")}
            >
              <option value="include">
                {t(
                  "الصافي بعد اقتطاع التأمينات",
                  "Net includes the social security deduction",
                )}
              </option>
              <option value="cut">
                {t(
                  "الصافي دون التأمينات ثم تُقتطع منه",
                  "Net without social security, then cut from it",
                )}
              </option>
            </select>
          </div>
        )}
        {outcome?.error && (
          <p className="text-red-600" role="alert">
            {outcome.error}
          </p>
        )}
      </section>

      {outcome?.value && (
        <section className="card">
          <p className="font-medium">
            {outcome.value.length.toLocaleString("en")} {t("صف", "rows")}
          </p>
          <ExportMenu
            salaries={outcome.value}
            name="sytax-range"
            settings={settings}
            taxOnFullSalary={ss && ssMode === "cut"}
          />
          <div className="-mx-4 max-h-[60dvh] overflow-auto">
            <table className="min-w-full text-sm whitespace-nowrap">
              <thead className="sticky top-0 bg-ground text-ink">
                <tr>
                  <th className="px-2 py-2">#</th>
                  {FIELDS.map((f) => (
                    <th key={f.key} className="px-2 py-2 font-medium">
                      {f.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody dir="ltr" className="text-end">
                {outcome.value.map((row, i) => (
                  <tr key={i} className="odd:bg-ground/50">
                    <td className="px-2 py-1 text-center">{i + 1}</td>
                    {FIELDS.map((f) => (
                      <td
                        key={f.key}
                        className={`px-2 py-1 ${f.key === "net" ? "font-bold" : ""}`}
                      >
                        {f.key === "compensation_ratio"
                          ? formatPercent(row[f.key])
                          : formatAmount(row[f.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
