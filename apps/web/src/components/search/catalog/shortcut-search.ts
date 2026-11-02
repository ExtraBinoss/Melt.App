import { EFFECT_CATALOG, type EffectType } from "@musart/core";
import { i18n } from "../../../state/i18n";
import type { KeyChord } from "../../../state/keybindings/model";
import { chordTokens } from "../../../state/keybindings/chords";
import type { BindingCommand } from "../../../state/keybindings/registry";
/** Search aliases are shared by the command palette and the configurable-shortcuts screen. */
export function shortcutTerms(tokens: readonly string[]): string {
  return tokens
    .map(
      (token) =>
        ({
          Mod: "ctrl control cmd command meta mod ⌘",
          Alt: "alt option opt ⌥",
          Shift: "shift maj ⇧",
          "⌫": "backspace",
          Del: "delete suppr",
        })[token] ?? token,
    )
    .join(" ");
}
export function shortcutQuery(value: string): string {
  return value
    .replace(/⌘/g, " cmd ")
    .replace(/⌥/g, " alt ")
    .replace(/⇧/g, " shift ")
    .replace(/⌫/g, " backspace ")
    .replace(/←/g, " arrowleft ")
    .replace(/→/g, " arrowright ")
    .replace(/↑/g, " arrowup ")
    .replace(/↓/g, " arrowdown ")
    .replace(/\besc\b/gi, "escape")
    .replace(/\b(del|suppr)\b/gi, "delete")
    .replace(/\b(control|ctrl|command|cmd|meta|mod)\b/gi, "mod")
    .replace(/\b(option|opt)\b/gi, "alt")
    .replace(/\bmaj\b/gi, "shift");
}
function shortcutWords(value: string): string[] {
  return shortcutQuery(value)
    .toLowerCase()
    .trim()
    .replace(/\+\s*$/, " plus ")
    .replace(/\+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}
export function shortcutMatches(chords: readonly KeyChord[], query: string): boolean {
  return chords.some((chord) => shortcutTokenMatch(chordTokens(chord), query) > 0);
}
/** Use only the active locale and English; configured chords retain their platform aliases. */
export function bindingMatches(
  command: BindingCommand,
  chords: readonly KeyChord[],
  query: string,
  translate: (key: string) => string,
): boolean {
  const shortcut = shortcutMatches(chords, query);
  if (isShortcutQuery(query)) return shortcut;
  return (
    shortcut ||
    textMatches(
      [
        translate(command.label),
        i18n.t(command.label, { lng: "en" }),
        commandDescription(command.id.slice(7), undefined, command.descriptionKey),
        commandDescription(command.id.slice(7), "en", command.descriptionKey),
        translate(`search:${command.category}`),
        i18n.t(`search:${command.category}`, { lng: "en" }),
        command.terms ?? "",
        command.id.startsWith("effect:") ? effectSearchTerms(command.id.slice(7)) : "",
      ].join(" "),
      query,
    )
  );
}
export function commandDescription(
  action: string,
  language?: string,
  descriptionKey?: string,
): string {
  const key = descriptionKey ?? `search:descriptions.${action}`;
  return i18n.exists(key, { lng: language }) ? String(i18n.t(key, { lng: language })) : "";
}

export function effectSearchTerms(type: string): string {
  const effect = EFFECT_CATALOG[type as EffectType];
  if (!effect) return "";
  return effect.parameters
    .flatMap((parameter) => [
      parameter.key,
      String(i18n.t(parameter.labelKey)),
      String(i18n.t(parameter.labelKey, { lng: "en" })),
      ...(parameter.kind === "select"
        ? parameter.options.flatMap((option) => [
            option.value,
            String(i18n.t(option.labelKey)),
            String(i18n.t(option.labelKey, { lng: "en" })),
          ])
        : []),
    ])
    .join(" ");
}
export function textMatches(text: string, query: string): boolean {
  const normalize = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const haystack = normalize(text);
  return normalize(query)
    .split(" ")
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}
export function isShortcutQuery(query: string): boolean {
  const words = shortcutWords(query);
  return (
    words.some((word) => ["mod", "alt", "shift"].includes(word)) &&
    words.some(
      (word) =>
        word.length === 1 ||
        /^(plus|space|enter|escape|delete|backspace|home|end|pageup|pagedown|tab|arrow(left|right|up|down)|f[0-9]{1,2})$/.test(
          word,
        ),
    )
  );
}
export function shortcutTokenMatch(tokens: readonly string[], query: string): number {
  const words = shortcutWords(query),
    keys = shortcutWords(tokens.join(" "));
  return words.every((word) => keys.includes(word)) ? 1000 - (keys.length - words.length) * 50 : 0;
}
