import { TEMPLATE_CATALOG } from "../../../services/projects/templates/catalog";

const featured = [
  "morphing-type",
  "bloom-windows",
  "cornell-box",
  "preset:instagram-story",
  "preset:youtube-thumbnail",
  "preset:instagram-post",
];
export const LANDING_TEMPLATES = featured.flatMap(
  (id) => TEMPLATE_CATALOG.find((item) => item.id === id) ?? [],
);
