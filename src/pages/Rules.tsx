import { useState } from "react";
import AmountInput from "../components/AmountInput";
import Toggle from "../components/Toggle";
import { DEFAULT_NAME, defaultSettings } from "../core/defaults";
import { download } from "../core/export";
import { parseConfigs, validate, type Configs } from "../core/settings";
import { ROUNDING_METHODS, type RoundingMethod } from "../core/taxes";
import { parseAmount } from "../lib/amount";
import { t } from "../lib/i18n";

const METHOD_NAMES: Record<RoundingMethod, string> = {
  HALF_UP: t("جبري (النصف للأعلى)", "Half up"),
  HALF_EVEN: t("مصرفي (النصف للزوجي)", "Half even (banker's)"),
  HALF_DOWN: t("النصف للأدنى", "Half down"),
  CEILING: t("للأعلى دائماً", "Always up (ceiling)"),
  FLOOR: t("للأدنى دائماً", "Always down (floor)"),
  UP: t("بعيداً عن الصفر", "Away from zero"),
  DOWN: t("نحو الصفر", "Toward zero"),
  "05UP": "05UP",
};

function getIn(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], obj);
}

function setIn<T>(obj: T, path: string, value: unknown): T {
  const copy = structuredClone(obj);
  const keys = path.split(".");
  const parent = keys.slice(0, -1).reduce<Record<string, unknown>>((node, key) => node[key] as Record<string, unknown>, copy as Record<string, unknown>);
  parent[keys[keys.length - 1]] = value;
  return copy;
}

const same = (a: unknown, b: unknown) => {
  const [x, y] = [parseAmount(String(a ?? "")), parseAmount(String(b ?? ""))];
  return x && y ? x.eq(y) : a === b;
};

interface Props {
  configs: Configs;
  onChange: (configs: Configs) => void;
}

export default function Rules({ configs, onChange }: Props) {
  const { active } = configs;
  const settings = configs.configs[active];
  const [draft, setDraft] = useState(settings);
  const [name, setName] = useState(active);
  const [saved, setSaved] = useState(false);
  const defaults = defaultSettings();
  const problems = validate(draft);
  const newName = name.trim();
  if (!newName) problems.name = t("أدخل اسماً للإعداد", "Enter a name for the config");
  else if (newName !== active && configs.configs[newName]) problems.name = t("يوجد إعداد بهذا الاسم", "A config with this name exists");
  const dirty = newName !== active || JSON.stringify(draft) !== JSON.stringify(settings);
  const names = Object.keys(configs.configs);
  const discard = () => !dirty || confirm(t("تجاهل التعديلات غير المحفوظة؟", "Discard unsaved changes?"));

  const update = (path: string, value: unknown) => {
    setDraft((d) => setIn(d, path, value));
    setSaved(false);
  };
  const text = (path: string, label: string, hint?: string) => (
    <AmountInput
      label={label}
      hint={hint}
      value={String(getIn(draft, path))}
      onChange={(v) => update(path, v)}
      error={problems[path]}
      changed={!same(getIn(draft, path), getIn(defaults, path))}
    />
  );
  const rounding = (path: string) => (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className="label" htmlFor={`${path}-method`}>
          {t("طريقة التقريب", "Rounding method")}
        </label>
        <select id={`${path}-method`} className="field" value={String(getIn(draft, `${path}.method`))} onChange={(e) => update(`${path}.method`, e.target.value)}>
          {ROUNDING_METHODS.map((m) => (
            <option key={m} value={m}>
              {METHOD_NAMES[m]}
            </option>
          ))}
        </select>
      </div>
      {text(`${path}.step`, t("إلى أقرب", "To the nearest"))}
    </div>
  );

  const save = () => {
    // Rebuilt in order so a renamed config keeps its place in the list.
    const entries = Object.entries(configs.configs).map(([n, s]) => (n === active ? [newName, draft] : [n, s]));
    onChange({ active: newName, configs: Object.fromEntries(entries) });
    setSaved(true);
  };
  const add = () => {
    if (!discard()) return;
    const base = t("إعداد", "Config");
    let n = 1;
    while (configs.configs[`${base} ${n}`]) n++;
    onChange({ active: `${base} ${n}`, configs: { ...configs.configs, [`${base} ${n}`]: defaultSettings() } });
  };
  const remove = () => {
    if (!confirm(t(`حذف الإعداد «${active}»؟`, `Delete the config “${active}”?`))) return;
    const rest = Object.fromEntries(Object.entries(configs.configs).filter(([n]) => n !== active));
    if (Object.keys(rest).length) return onChange({ active: Object.keys(rest)[0], configs: rest });
    // Deleting the last config brings back the built-in defaults; the page may keep its key, so reset the form too.
    onChange({ active: DEFAULT_NAME, configs: { [DEFAULT_NAME]: defaultSettings() } });
    setDraft(defaultSettings());
    setName(DEFAULT_NAME);
  };
  const exportConfigs = () => download(JSON.stringify(configs, null, 2), "sytax-configs.json", "application/json");
  const importConfigs = async (file: File | undefined) => {
    if (!file || !discard()) return;
    let imported: Configs | null = null;
    try {
      imported = parseConfigs(await file.text());
    } catch {
      // not JSON: reported below
    }
    if (!imported) return alert(t("الملف لا يحتوي على إعدادات صالحة", "The file has no valid configs"));
    // Imported configs replace ones of the same name and keep the others.
    const merged = { active: imported.active, configs: { ...configs.configs, ...imported.configs } };
    onChange(merged);
    // The page keeps its key when the active name is unchanged, so load the form too.
    setDraft(merged.configs[merged.active]);
    setName(merged.active);
  };
  const reset = () => {
    setDraft(defaultSettings());
    setSaved(false);
  };

  const brackets = draft.tax.brackets;

  return (
    <div className="space-y-3">
      <section className="card">
        <h2 className="text-lg font-bold">{t("القواعد الضريبية", "Tax rules")}</h2>
        <div>
          <label className="label" htmlFor="config">
            {t("الإعداد المستخدم", "Config in use")}
          </label>
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <select id="config" className="field" value={active} onChange={(e) => discard() && onChange({ ...configs, active: e.target.value })}>
              {names.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
            <button type="button" className="btn-secondary" onClick={add}>
              {t("جديد", "New")}
            </button>
            <button type="button" className="btn bg-red-700 text-white hover:bg-red-800 focus:ring-2 focus:ring-red-400" onClick={remove}>
              {t("حذف", "Delete")}
            </button>
          </div>
        </div>
        <div>
          <label className={`label ${problems.name ? "text-red-600" : ""}`} htmlFor="config-name">
            {t("اسم الإعداد", "Config name")}
          </label>
          <input
            id="config-name"
            className="field"
            autoComplete="off"
            value={name}
            aria-invalid={!!problems.name}
            aria-describedby={problems.name ? "config-name-note" : undefined}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
          />
          {problems.name && (
            <span id="config-name-note" className="mt-1 block text-sm text-red-600">
              {problems.name}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn-secondary" onClick={exportConfigs}>
            {t("تصدير الإعدادات", "Export configs")}
          </button>
          <label className="btn-secondary text-center focus-within:ring-2">
            {t("استعادة من ملف", "Restore from file")}
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={(e) => {
                importConfigs(e.target.files?.[0]);
                e.target.value = ""; // so the same file can be picked again
              }}
            />
          </label>
        </div>
        <span className="block text-sm text-muted">
          <span className="inline-block size-2 rounded-full bg-barley-corn-500" /> {t("قيمة معدّلة عن الافتراضي", "Value changed from the default")}
        </span>
      </section>

      <div className="grid xl:grid-cols-3 items-start gap-2">

          <section className="card">
            <h3 className="font-bold">{t("شرائح ضريبة الراتب", "Salary tax brackets")}</h3>
            <p className="text-sm text-muted">
              {t(
                "كل شريحة تبدأ من حدّها الأدنى حتى بداية التالية، والأخيرة بلا سقف. النسبة كسر عشري: 0.11 تعني 11%.",
                "Each bracket runs from its lower limit to the start of the next; the last has no cap. Rates are decimals: 0.11 means 11%.",
              )}
            </p>
            {brackets.map((_, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-start gap-2">
                {text(`tax.brackets.${i}.lower`, t("من", "From"))}
                {text(`tax.brackets.${i}.rate`, t("النسبة", "Rate"))}
                <button
                  type="button"
                  className="mt-6 min-h-11 min-w-11 rounded-md text-red-600 hover:bg-red-50 disabled:opacity-30"
                  aria-label={`${t("حذف الشريحة", "Delete bracket")} ${i + 1}`}
                  disabled={brackets.length === 1}
                  onClick={() => update("tax.brackets", brackets.filter((__, j) => j !== i))}
                >
                  ✕
                </button>
              </div>
            ))}
            {problems["tax.brackets"] && <p className="text-red-600">{problems["tax.brackets"]}</p>}
            <button type="button" className="btn-secondary" onClick={() => update("tax.brackets", [...brackets, { lower: "", rate: "" }])}>
              {t("إضافة شريحة", "Add bracket")}
            </button>
            <Toggle label={t("تقريب خاص لضريبة الشرائح", "Own rounding for the brackets tax")} checked={draft.tax.bracket_rounding.enabled} onChange={(v) => update("tax.bracket_rounding.enabled", v)} />
            {draft.tax.bracket_rounding.enabled && (
              <>
                <div>
                  <label className="label" htmlFor="bracket-rounding-mode">
                    {t("ما يُقرَّب", "What is rounded")}
                  </label>
                  <select id="bracket-rounding-mode" className="field" value={draft.tax.bracket_rounding.mode} onChange={(e) => update("tax.bracket_rounding.mode", e.target.value)}>
                    <option value="each">{t("ضريبة كل شريحة قبل جمعها", "Each bracket's tax, before adding")}</option>
                    <option value="total">{t("مجموع ضريبة الشرائح", "The total of the brackets tax")}</option>
                  </select>
                </div>
                {rounding("tax.bracket_rounding")}
              </>
            )}
          </section>

          <section className="card">
            <h3 className="font-bold">{t("الافتراضيات", "Defaults")}</h3>
            {text("net.compensation_share", t("نسبة التعويضات من الصافي", "Compensation share of net"), t("كسر عشري بين 0 و 1", "A decimal between 0 and 1"))}
            {text("input.step", t("مقدار الزيادة والإنقاص", "Increase and decrease step"), t("ما يضيفه زرّا + و − في حقول الحاسبة", "What the + and − buttons add in calculator fields"))}
            {text("input.share_step", t("مقدار زيادة النسبة وإنقاصها", "Percentage step"), t("ما يضيفه زرّا + و − في حقل النسبة %", "What the + and − buttons add in the % field"))}
            <div className="grid grid-cols-3 gap-2">
              <AmountInput
                label={t("أقصى عدد صفوف", "Max rows")}
                value={String(draft.range.max_size)}
                onChange={(v) => update("range.max_size", Number(parseAmount(v) ?? NaN))}
                error={problems["range.max_size"]}
                changed={draft.range.max_size !== defaults.range.max_size}
              />
              {text("range.stop_factor", t("النهاية = البداية ×", "End = start ×"))}
              {text("range.step_divisor", t("الفاصل = البداية ÷", "Step = start ÷"))}
            </div>
            {text("range.slider_max", t("نهاية شريط سلّم الرواتب", "Salary scale slider end"))}
          </section>

          <section className="card">
            <h3 className="font-bold">{t("التأمينات الاجتماعية", "Social security")}</h3>
            <Toggle label={t("مفعّلة افتراضياً", "On by default")} checked={draft.tax.social_security.enabled} onChange={(v) => update("tax.social_security.enabled", v)} />
            {text("tax.social_security.rate", t("نسبة الاقتطاع", "Deduction rate"))}
            {text("tax.social_security.min_salary", t("الحد الأدنى لراتب التأمينات", "Minimum insured salary"))}
            {text(
              "tax.social_security.insured_salary",
              t("راتب التأمينات الافتراضي", "Default social security salary"),
              t("يُملأ به حقل راتب التأمينات في الحاسبة؛ فارغاً يُحسب على الراتب", "Fills the calculators' social security salary; empty uses the salary"),
            )}
            {rounding("tax.social_security.rounding")}
          </section>

          <section className="card">
            <h3 className="font-bold">{t("ضريبة الراتب والتعويضات", "Salary and compensation tax")}</h3>
            {text("tax.min_salary", t("الحد الأدنى للراتب", "Minimum salary"), t("لا يمكن حساب صافٍ أقل منه", "No net below it can be calculated"))}
            {text("tax.compensation_tax_rate", t("ضريبة التعويضات (نسبة ثابتة)", "Compensation tax (flat rate)"))}
            {rounding("tax.rounding")}
          </section>

          <section className="card">
            <h3 className="font-bold">{t("أمثلة الحقول الفارغة", "Empty field examples")}</h3>
            <p className="text-sm text-muted">{t("النص الباهت الظاهر في حقول الحاسبة قبل الكتابة.", "The faint text shown in calculator fields before typing.")}</p>
            <div className="grid grid-cols-2 gap-2">
              {text("placeholders.salary", t("الراتب المقطوع", "Base salary"))}
              {text("placeholders.compensation", t("التعويضات", "Compensation"))}
              {text("placeholders.net", t("الصافي المطلوب", "Target net"))}
              {text("placeholders.start", t("الصافي الأول", "First net"))}
              {text("placeholders.share", t("نسبة التعويضات %", "Compensation share %"))}
            </div>
          </section>

      </div>

      <div className="sticky bottom-20 grid grid-cols-2 gap-2 rounded-lg border border-line/60 bg-surface p-2 shadow-lg md:bottom-4">
        <button type="button" className="btn-primary" disabled={!dirty || Object.keys(problems).length > 0} onClick={save}>
          {saved && !dirty ? t("تم الحفظ", "Saved") : t("حفظ", "Save")}
        </button>
        <button type="button" className="btn-secondary" onClick={reset}>
          {t("إعادة القيم الافتراضية", "Reset to defaults")}
        </button>
      </div>
    </div>
  );
}
