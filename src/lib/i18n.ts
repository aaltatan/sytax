// The language is fixed for a page load; switching saves it and reloads, so module-level text (FIELDS, defaults) needs no re-render.
export type Lang = "ar" | "en";

const LANG_KEY = "sytax.lang";

function savedLang(): Lang {
  try {
    return globalThis.localStorage?.getItem(LANG_KEY) === "en" ? "en" : "ar";
  } catch {
    return "ar"; // blocked storage, or tests in node
  }
}

export const lang: Lang = savedLang();

/** The text in the current language. */
export const t = (ar: string, en: string) => (lang === "en" ? en : ar);

export function setLang(l: Lang): void {
  try {
    localStorage.setItem(LANG_KEY, l);
  } catch {
    // private mode: nothing to keep, so the reload would undo the switch
    return;
  }
  location.reload();
}
