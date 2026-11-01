import { TEMPLATE_CATALOG } from "../../../services/projects/templates/catalog";
import media from "./media/manifest.json";

const featured = [
  "morphing-type",
  "bloom-windows",
  "cornell-box",
  "angel-windows",
  "terminal-signal",
  "second-skin",
  "share-your-work",
] as const;
export const LANDING_TEMPLATES = featured.flatMap((id) => {
  const template = TEMPLATE_CATALOG.find((item) => item.id === id);
  const clip = media[id];
  return template
    ? [
        {
          ...template,
          preview: `${import.meta.env.BASE_URL}${clip.poster}`,
          video: `${import.meta.env.BASE_URL}${clip.video}`,
        },
      ]
    : [];
});
