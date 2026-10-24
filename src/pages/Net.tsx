import { useState } from "react";
import AmountInput from "../components/AmountInput";
import ResultCard from "../components/ResultCard";
import ShareInput from "../components/ShareInput";
import Toggle from "../components/Toggle";
import { calculateNet } from "../core/services";
import { toRules, type Settings } from "../core/settings";
import { formatAmount, parseAmount, parseShare, shareText } from "../lib/amount";
import { attempt, notANumber } from "../lib/errors";
import { t } from "../lib/i18n";

export default function Net({ settings }: { settings: Settings }) {
  const [net, setNet] = useState("");
  const [share, setShare] = useState(() => shareText(settings.net.compensation_share));
  const [ss, setSs] = useState(settings.tax.social_security.enabled);
  const [insured, setInsured] = useState(settings.tax.social_security.insured_salary);

  const n = parseAmount(net);
  const r = parseShare(share);
  const i = insured.trim() ? parseAmount(insured) : null;
  const outcome =
    n && r && !notANumber(insured, i) ? attempt(() => calculateNet(toRules(settings, ss), n, r, ss ? i : null)) : null;

  return (
    <div className="space-y-3 md:grid md:grid-cols-[20rem_minmax(0,40rem)] md:items-start md:gap-4 md:space-y-0">
      <section className="card">
        <h2 className="text-lg font-bold">{t("من الصافي إلى الإجمالي", "Net to gross")}</h2>
        <AmountInput step={settings.input.step} label={t("الصافي المطلوب", "Target net")} value={net} onChange={setNet} placeholder={settings.placeholders.net} error={notANumber(net, n)} />
        <ShareInput step={settings.input.share_step} placeholder={settings.placeholders.share} value={share} onChange={setShare} error={notANumber(share, r)} />
        <Toggle label={t("مشترك في التأمينات الاجتماعية", "Pays social security")} checked={ss} onChange={setSs} />
        {ss && (
          <AmountInput step={settings.input.step}
            label={t("راتب التأمينات الاجتماعية", "Social security salary")}
            value={insured}
            onChange={setInsured}
            placeholder={t("الإجمالي الناتج", "The resulting gross")}
            hint={`${t("يُترك فارغاً ليُحسب على الإجمالي الناتج؛ الحد الأدنى", "Leave empty to use the resulting gross; minimum")} ${formatAmount(parseAmount(settings.tax.social_security.min_salary)!)}`}
            error={notANumber(insured, i)}
          />
        )}
        {outcome?.error && <p className="text-red-600" role="alert">{outcome.error}</p>}
      </section>
      {outcome?.value && <ResultCard salary={outcome.value} name="sytax-net" settings={settings} />}
    </div>
  );
}
