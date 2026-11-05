import { createRoot } from "react-dom/client";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { Throbber } from "../../../apps/web/src/components/ui/throbber/Throbber";

void i18next.use(initReactI18next).init({
  lng: "fr",
  fallbackLng: "fr",
  initAsync: false,
  resources: {},
});

createRoot(document.getElementById("root")!).render(
  <Throbber label="Ouverture de « My winter studio »" variant="shimmer" delayMs={0} size={64} />,
);
