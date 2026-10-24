import { useEffect, useState } from "react";
import { loadConfigs, saveConfigs, type Configs } from "./core/settings";
import Gross from "./pages/Gross";
import Net from "./pages/Net";
import Range from "./pages/Range";
import Rules from "./pages/Rules";
import { lang, setLang, t } from "./lib/i18n";

const TABS = [
  { id: "gross", label: t("إجمالي ← صافي", "Gross → Net"), icon: "M4 6h16M4 12h10M4 18h6" },
  { id: "net", label: t("صافي ← إجمالي", "Net → Gross"), icon: "M4 6h6M4 12h10M4 18h16" },
  { id: "range", label: t("سلّم رواتب", "Salary scale"), icon: "M6 20v-6M12 20V10M18 20V4" },
  { id: "rules", label: t("القواعد", "Rules"), icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2.2-1.3L14.3 3h-4l-.4 2.4a7.6 7.6 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2.2 1.3l.4 2.4h4l.4-2.4a7.6 7.6 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3z" },
] as const;

type Tab = (typeof TABS)[number]["id"];

// Hash routes (#/net) work on any static host without a server-side fallback.
const tabFromHash = (): Tab => TABS.find((t) => location.hash === `#/${t.id}`)?.id ?? "gross";

// Shown in the other language, so each reader can find it.
const LangButton = ({ className }: { className: string }) => (
  <button
    type="button"
    lang={lang === "en" ? "ar" : "en"}
    className={`min-h-11 rounded-md px-3 text-sm text-on-ground underline ${className}`}
    onClick={() => setLang(lang === "en" ? "ar" : "en")}
  >
    {lang === "en" ? "العربية" : "English"}
  </button>
);

// Both icons render and CSS shows the one for the other mode, so no state is needed.
const ThemeButton = ({ className }: { className: string }) => (
  <button
    type="button"
    aria-label={t("تبديل الوضع الداكن", "Toggle dark mode")}
    className={`min-h-11 min-w-11 rounded-md px-3 text-on-ground hover:bg-line/40 ${className}`}
    onClick={() => {
      const dark = document.documentElement.classList.toggle("dark");
      try {
        localStorage.theme = dark ? "dark" : "light";
      } catch {}
    }}
  >
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path className="dark:hidden" d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      <path className="hidden dark:inline" d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </svg>
  </button>
);

export default function App() {
  const [tab, setTab] = useState(tabFromHash);
  const [configs, setConfigs] = useState(loadConfigs);
  const settings = configs.configs[configs.active];
  const version = JSON.stringify(settings);
  const changeConfigs = (c: Configs) => {
    saveConfigs(c);
    setConfigs(c);
  };

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);

  return (
    <div className="mx-auto max-w-md px-4 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:flex md:h-dvh md:max-w-none md:p-0">
      {/* Sidebar on wider screens, like a desktop app. */}
      <div className="mb-3 md:mb-0 md:flex md:w-64 md:shrink-0 md:flex-col md:gap-4 md:border-e md:border-line md:bg-ground-deep md:p-4">
        <header className="flex items-center gap-3 text-on-ground md:px-1 md:pb-2">
          <img src="/logo.svg" alt="" className="size-14 shrink-0 md:size-10" />
          <div>
            <h1 className="text-xl font-bold tracking-tighter whitespace-nowrap md:text-base md:whitespace-normal md:leading-snug">{t("ضريبة دخل الرواتب والأجور", "Salary & Wage Income Tax")}</h1>
            <p className="text-sm text-muted">
              {t("وفق", "Per")} {configs.active}
            </p>
          </div>
          <ThemeButton className="ms-auto md:hidden" />
          <LangButton className="md:hidden" />
        </header>

        {/* Bottom tab bar on phones, a vertical list in the sidebar on wider screens. */}
        <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-ground-deep pb-[env(safe-area-inset-bottom)] md:static md:border-0 md:pb-0">
          <div className="mx-auto grid max-w-md grid-cols-4 md:flex md:max-w-none md:flex-col md:gap-1">
            {TABS.map((t) => (
              <a
                key={t.id}
                href={`#/${t.id}`}
                aria-current={tab === t.id ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs md:min-h-11 md:flex-row md:justify-start md:gap-2 md:rounded-md md:px-4 md:text-sm md:hover:bg-line/40 ${tab === t.id ? "font-bold text-ink md:bg-line/60" : "text-muted"}`}
              >
                <svg viewBox="0 0 24 24" className="size-6 md:size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d={t.icon} />
                </svg>
                {t.label}
              </a>
            ))}
          </div>
        </nav>
        <div className="hidden md:mt-auto md:flex">
          <ThemeButton className="" />
          <LangButton className="" />
        </div>
      </div>

      <div className="md:flex md:min-w-0 md:flex-1 md:flex-col">
        <div className="hidden h-12 shrink-0 items-center border-b border-line bg-field px-4 font-bold text-ink md:flex">
          {TABS.find((x) => x.id === tab)!.label}
        </div>

        {/* Pages stay mounted so switching tabs keeps what was typed; saving rules remounts them to pick up new defaults. */}
        <main className="md:flex-1 md:overflow-auto md:bg-ground md:p-4">
          <div hidden={tab !== "gross"}>
            <Gross key={version} settings={settings} />
          </div>
          <div hidden={tab !== "net"}>
            <Net key={version} settings={settings} />
          </div>
          <div hidden={tab !== "range"}>
            <Range key={version} settings={settings} />
          </div>
          <div hidden={tab !== "rules"}>
            {/* Remounts on switching config, so the draft starts from the chosen one. */}
            <Rules key={configs.active} configs={configs} onChange={changeConfigs} />
          </div>
        </main>

        {/* Footer on phones, status bar on wider screens. */}
        <p className="mt-6 text-center text-sm text-muted md:mt-0 md:flex md:h-7 md:shrink-0 md:items-center md:justify-between md:border-t md:border-line md:bg-ground-deep md:px-4 md:text-xs">
          <span className="hidden md:inline">
            {t("وفق", "Per")} {configs.active}
          </span>
          <span>
            {t("تم الإنشاء بواسطة", "Made by")}{" "}
            <a target="_blank" rel="noreferrer" className="text-on-ground underline" href="https://github.com/aaltatan">
              عبدالله التتان
            </a>
          </span>
        </p>
      </div>
    </div>
  );
}
