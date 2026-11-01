import { createFileRoute, redirect } from "@tanstack/react-router";
import { LandingRoute } from "../routing/LandingRoute";
import { brand } from "../ui/brand/config";
import { LANDING_TEMPLATES } from "../components/projects/landing/catalog";

export const Route = createFileRoute("/")({
  beforeLoad: ({ location }) => {
    const search = new URLSearchParams(location.searchStr);
    if (search.has("automation") || search.has("benchmark"))
      throw redirect({ to: "/editor", search: location.search, replace: true });
  },
  head: () => ({
    links: [
      { rel: "canonical", href: "https://melt.plinka.eu/" },
      {
        rel: "preload",
        href: LANDING_TEMPLATES[0]?.preview,
        as: "image",
        fetchPriority: "high",
      },
      {
        rel: "preload",
        href: brand.typeface.source,
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous" as const,
      },
    ],
    meta: [
      { title: "Melt — Design with ease. Animate to captivate." },
      { property: "og:title", content: "Melt — Design with ease. Animate to captivate." },
      {
        property: "og:description",
        content:
          "An open-source creative studio for images, typography and motion. Your projects stay on your device.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: LandingRoute,
});
