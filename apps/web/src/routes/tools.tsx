import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SitePage } from "../components/site/SitePage";
export const Route = createFileRoute("/tools")({
  component: () => (
    <SitePage>
      <Outlet />
    </SitePage>
  ),
});
