import { createFileRoute } from "@tanstack/react-router";
import libraryStyles from "../components/projects/dashboard/library.css?url";
import searchStyles from "../components/assets/SearchInput.module.css?inline";
export const Route = createFileRoute("/_workspace/dashboard")({
  head: () => ({
    links: [{ rel: "stylesheet", href: libraryStyles }],
    styles: [{ children: searchStyles }],
    meta: [{ title: "Dashboard · Melt" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: () => null,
});
