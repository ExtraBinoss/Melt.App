import type { ReactNode } from "react";
import { useTheme } from "../../state/session/editor";
import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";
export function SitePage({ children }: { children: ReactNode }) {
  useTheme();
  return (
    <div className="public-page" id="top">
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
