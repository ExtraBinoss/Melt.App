import { useEffect } from "react";
import { captureOpeningOrigin } from "../components/projects/opening/origin";
import { preloadStudio } from "../bootstrap/preload";
import { useNavigate } from "@tanstack/react-router";
import { LandingPage } from "../components/projects/landing/LandingPage";
import { useTheme } from "../state/session/editor";
import "./messages";
import { useRestoreLocale } from "../state/i18n/use-locale";

export function LandingRoute() {
  useRestoreLocale();
  const navigate = useNavigate();
  useTheme();
  useEffect(() => captureOpeningOrigin(document), []);
  const open = (template?: string) => {
    void import("../components/projects/opening/navigation")
      .then(({ revealNavigation }) =>
        revealNavigation(
          () =>
            navigate({
              to: "/dashboard",
              search: template ? { preview: "template", item: template } : {},
            }),
          template ? ".library-item-dialog" : ".project-dashboard",
        ),
      )
      .catch((error: unknown) => console.error("[Melt navigation]", error));
  };
  return (
    <LandingPage
      onCreate={() => open()}
      onTemplate={open}
      onPrepare={() => {
        void import("../components/projects/opening/navigation").catch(() => {});
        void preloadStudio().catch(() => {});
      }}
    />
  );
}
