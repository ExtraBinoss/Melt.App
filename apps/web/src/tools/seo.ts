import { brand } from "../ui/brand/config";
import { TOOL_PAGES, toolPath, type ToolDefinition } from "./catalog";
import en from "./content/en.json";
export function toolHead(tool?: ToolDefinition) {
  const style = tool ? en.styles[tool.style] : null;
  const title = `${tool && style ? en.title.replace("{{style}}", style.name) : en.hubTitle} — ${brand.name}`;
  const description = tool && style ? `${style.summary} ${en.local}` : en.hubIntro;
  const path = tool ? toolPath(tool) : "/tools";
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: `${brand.site}${path}` },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: `${brand.site}${path}` }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(
          tool
            ? {
                "@context": "https://schema.org",
                "@type": "WebApplication",
                name: title.replace(` — ${brand.name}`, ""),
                url: `${brand.site}${path}`,
                description,
                applicationCategory: "MultimediaApplication",
                operatingSystem: "Web",
                browserRequirements: "A browser with WebGPU or WebGL and supported media codecs",
                offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
              }
            : {
                "@context": "https://schema.org",
                "@type": "CollectionPage",
                name: title,
                url: `${brand.site}/tools`,
                mainEntity: {
                  "@type": "ItemList",
                  itemListElement: TOOL_PAGES.map((item, index) => ({
                    "@type": "ListItem",
                    position: index + 1,
                    name: en.title.replace("{{style}}", en.styles[item.style].name),
                    url: `${brand.site}${toolPath(item)}`,
                  })),
                },
              },
        ).replace(/</g, "\\u003c"),
      },
    ],
  };
}
