import i18n from "i18next";
import { messages } from "./messages";

export function tutorialError(
  key: keyof typeof messages.en.errors,
  values?: Record<string, string>,
) {
  return new Error(i18n.t(`errors.${key}`, { ns: "editorTutorial", ...values }));
}
