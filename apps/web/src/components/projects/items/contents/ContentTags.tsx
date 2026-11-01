import { getEffectDefinition, type EffectType, type ProjectContentTag } from "@musart/core";
import { useTranslation } from "react-i18next";
import "../../../properties/effects/library-messages";
import "./messages";
import "./contents.css";

export function contentTagLabel(
  tag: ProjectContentTag,
  translate: (key: string) => string,
): string {
  const [kind, value] = tag.split(":");
  return kind === "effect"
    ? translate(getEffectDefinition(value as EffectType).nameKey)
    : translate(`libraryContents:${kind}.${value}`);
}

export function ContentTags({
  tags,
  limit,
}: {
  tags?: readonly ProjectContentTag[];
  limit?: number;
}) {
  const { t } = useTranslation();
  if (!tags?.length) return null;
  const shown = limit === undefined ? tags : tags.slice(0, limit);
  const rest = tags.slice(shown.length);
  return (
    <ul
      className="library-content-tags"
      aria-label={t("libraryContents:used")}
      data-compact={limit !== undefined || undefined}
    >
      {shown.map((tag) => (
        <li key={tag} data-content-tag={tag}>
          {contentTagLabel(tag, t)}
        </li>
      ))}
      {!!rest.length && (
        <li title={rest.map((tag) => contentTagLabel(tag, t)).join(", ")}>
          {t("libraryContents:more", { count: rest.length })}
        </li>
      )}
    </ul>
  );
}
