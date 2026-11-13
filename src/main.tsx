import { RequireAuth, WardenProvider } from "@abdullahaltatan/warden-js/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { lang, t } from "./lib/i18n";
import { isCallback, warden } from "./lib/warden";
import "./styles.css";

registerSW({ immediate: true });

document.documentElement.lang = lang;
document.documentElement.dir = lang === "en" ? "ltr" : "rtl";
document.title = t("ضريبة الرواتب والأجور", "Salary & Wage Tax");

const root = createRoot(document.getElementById("root")!);

const status = (text: string) => (
  <p className="p-8 text-center text-muted" role="status">
    {text}
  </p>
);

async function start() {
  // Back from warden's sign-in: trade the code once (the URL is cleared right after), then go where sign-in started.
  if (isCallback(location.search)) {
    try {
      const returnTo = await warden.handleCallback();

      history.replaceState(null, "", returnTo ?? "/");
    } catch (error) {
      console.error(error);

      // Not RequireAuth here: a failing sign-in would redirect back and forth forever.
      root.render(
        <div className="p-8 text-center">
          {status(t("تعذّر تسجيل الدخول.", "Sign-in failed."))}
          <button
            type="button"
            className="min-h-11 rounded-md px-3 text-on-ground underline"
            onClick={() => void warden.signIn()}
          >
            {t("حاول مجدداً", "Try again")}
          </button>
        </div>,
      );

      return;
    }
  }

  root.render(
    <StrictMode>
      <WardenProvider warden={warden}>
        <RequireAuth fallback={status(t("جارٍ تسجيل الدخول…", "Signing in…"))}>
          <App />
        </RequireAuth>
      </WardenProvider>
    </StrictMode>,
  );
}

void start();
