import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { lang, t } from "./lib/i18n";
import "./styles.css";

registerSW({ immediate: true });

document.documentElement.lang = lang;
document.documentElement.dir = lang === "en" ? "ltr" : "rtl";
document.title = t("ضريبة الرواتب والأجور", "Salary & Wage Tax");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
