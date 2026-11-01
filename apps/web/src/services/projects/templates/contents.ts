import { projectContentTags, type ProjectContentTag } from "@musart/core";
import detected from "virtual:template-contents";

const blank = projectContentTags({ pages: [] });
/** Build-derived from the real template documents; format presets create empty canvases. */
export function templateContentTags(id: string): readonly ProjectContentTag[] | undefined {
  if (id.startsWith("preset:")) return blank;
  return detected[id];
}
