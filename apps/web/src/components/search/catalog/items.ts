import { backgroundImage } from "../../../services/selection/background-action";
import { i18n } from "../../../state/i18n";
import { shortcutTerms, commandDescription, effectSearchTerms } from "./shortcut-search";
import { supportedLocales } from "../../../state/i18n/locales";
import { EFFECT_CATALOG, type SessionSnapshot } from "@musart/core";
import { layerSelection } from "../../layers/menu/selection";
import { SEARCH_CATEGORIES, type SearchItem, type SearchTranslate } from "./model";

import { createDocumentSearchItems } from "./document-items";
import { ACTIONS } from "./definitions";
import { keybindings } from "../../../state/keybindings/store";
import { chordTokens } from "../../../state/keybindings/chords";
import type { BindingSnapshot, CommandId } from "../../../state/keybindings/model";

export const SEARCH_COMMAND_IDS: readonly string[] = Object.freeze([
  ...ACTIONS.map((item) => `action:${item.action}`),
  ...Object.keys(EFFECT_CATALOG)
    .filter(
      (type) =>
        !EFFECT_CATALOG[type as keyof typeof EFFECT_CATALOG].source &&
        !EFFECT_CATALOG[type as keyof typeof EFFECT_CATALOG].retired,
    )
    .map((type) => `effect:${type}`),
]);

/** Stable commands can be pinned without enumerating project pages or layers. */
export function createSearchCommandItems(
  snapshot: SessionSnapshot,
  t: SearchTranslate,
  bindings: BindingSnapshot = keybindings.readSnapshot(),
): SearchItem[] {
  const shortcut = (id: CommandId) => {
    const chord = bindings.bindings.get(id)?.[0];
    return chord ? chordTokens(chord) : undefined;
  };
  const page =
    snapshot.project.pages.find((item) => item.id === snapshot.pageId) ??
    snapshot.project.pages[0]!;
  const { selected, editable, canGroup, canUngroup } = layerSelection(page, snapshot.selection);
  const disabled = {
    image: backgroundImage(snapshot) ? undefined : t("pixelSelection:selectMediaFirst"),
    motion: page.motion?.mode === "motion" ? undefined : t("motion:requiresMotion"),
    selection: selected.length ? undefined : t("search:noSelection"),
    editable: editable ? undefined : t("search:noSelection"),
    group: canGroup ? undefined : t("search:groupSelection"),
    ungroup: canUngroup ? undefined : t("search:ungroupSelection"),
    undo: snapshot.canUndo ? undefined : t("search:noUndo"),
    redo: snapshot.canRedo ? undefined : t("search:noRedo"),
  };
  const actions: SearchItem[] = ACTIONS.map((item) => ({
    id: `action:${item.action}`,
    category: item.category,
    label: t(item.label),
    englishLabel: String(i18n.t(item.label, { lng: "en" })),
    description: commandDescription(item.action, undefined, item.descriptionKey),
    englishDescription: commandDescription(item.action, "en", item.descriptionKey),
    shortcuts: (bindings.bindings.get(`action:${item.action}`) ?? []).map(chordTokens),
    shortcutSearch: (bindings.bindings.get(`action:${item.action}`) ?? [])
      .map((chord) => shortcutTerms(chordTokens(chord)))
      .join(" "),
    terms: `${item.terms} ${t(`search:${item.category}`)} ${i18n.t(`search:${item.category}`, { lng: "en" })}`,
    shortcut: shortcut(`action:${item.action}`),
    disabled: item.gate ? disabled[item.gate] : undefined,
    target: { kind: "action", action: item.action },
  }));
  const effects: SearchItem[] = Object.values(EFFECT_CATALOG)
    .filter((effect) => !effect.source && !effect.retired)
    .map((effect) => ({
      id: `effect:${effect.type}`,
      label: t(`search:effectLabels.${effect.type}`),
      englishLabel: String(i18n.t(`search:effectLabels.${effect.type}`, { lng: "en" })),
      description: effect.descriptionKey ? t(effect.descriptionKey) : "",
      englishDescription: effect.descriptionKey
        ? String(i18n.t(effect.descriptionKey, { lng: "en" }))
        : "",
      shortcuts: (bindings.bindings.get(`effect:${effect.type}`) ?? []).map(chordTokens),
      shortcutSearch: (bindings.bindings.get(`effect:${effect.type}`) ?? [])
        .map((chord) => shortcutTerms(chordTokens(chord)))
        .join(" "),
      category: effect.category === "effect" ? "effects" : "adjustments",
      terms: `${effect.type} effect adjustment color ${effectSearchTerms(effect.type)} ${t(`search:${effect.category === "effect" ? "effects" : "adjustments"}`)} ${i18n.t(`search:${effect.category === "effect" ? "effects" : "adjustments"}`, { lng: "en" })}`,
      detail: t("search:applyToSelection"),
      disabled: disabled.editable,
      shortcut: shortcut(`effect:${effect.type}`),
      target: { kind: "effect", effect: effect.type },
    }));
  const languages: SearchItem[] = supportedLocales
    .filter(({ code }) => code !== "en" && code !== "fr")
    .map(({ code, label, englishLabel }) => ({
      id: `language:${code}`,
      category: "preferences",
      label: `${t("search:language")}: ${label}`,
      terms: `${code} ${label} ${englishLabel} language ${t("search:language")}`,
      target: { kind: "language", language: code },
    }));
  return [...actions, ...effects, ...languages].sort(
    (a, b) => SEARCH_CATEGORIES.indexOf(a.category) - SEARCH_CATEGORIES.indexOf(b.category),
  );
}

export function createSearchItems(
  snapshot: SessionSnapshot,
  t: SearchTranslate,
  bindings?: BindingSnapshot,
): SearchItem[] {
  const commands = createSearchCommandItems(snapshot, t, bindings);
  const document = createDocumentSearchItems(snapshot.project, t);
  return [...commands, ...document].sort(
    (a, b) => SEARCH_CATEGORIES.indexOf(a.category) - SEARCH_CATEGORIES.indexOf(b.category),
  );
}
