import { useEffect } from "react";
import { preloadStudio, scheduleStudioPreload } from "../bootstrap/preload";
import { useNavigate } from "@tanstack/react-router";
import { LandingPage } from "../components/projects/landing/LandingPage";
import { useTheme } from "../state/session/editor";
import "./messages";
import { useRestoreLocale } from "../state/i18n/use-locale";

export function LandingRoute() {
  useRestoreLocale();
  const navigate = useNavigate();
  useTheme();
  useEffect(() => scheduleStudioPreload(), []);
  return (
    <LandingPage
      onCreate={() => {
        void navigate({ to: "/dashboard" });
      }}
      onTemplate={(id) => {
        void navigate({ to: "/editor", search: { template: id } });
      }}
      onPrepare={() => {
        void preloadStudio().catch(() => {});
      }}
    />
  );
}
