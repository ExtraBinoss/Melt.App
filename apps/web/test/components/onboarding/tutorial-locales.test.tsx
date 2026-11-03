import { afterEach, expect, test } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { i18n } from "../../../src/state/i18n";
import { supportedLocales } from "../../../src/state/i18n/locales";
import { messages } from "../../../src/components/onboarding/tutorial/messages";
import { steps } from "../../../src/components/onboarding/tutorial/content";
import { Speech } from "../../../src/components/onboarding/tutorial/Speech";
import { tutorialError } from "../../../src/components/onboarding/tutorial/errors";
import ar from "../../../src/components/onboarding/tutorial/locales/ar.json";
import { messages as motionMessages } from "../../../src/components/motion/messages";

function flatten(value: unknown, prefix = ""): Record<string, string> {
  if (typeof value === "string") return { [prefix]: value };
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, item]) =>
      Object.entries(flatten(item, `${prefix}.${key}`)),
    ),
  );
}
const english = flatten(messages.en);
const tokens = (value: string) => value.match(/\{\{[^{}]+\}\}|\{[a-zA-Z]+\}/g)?.sort() ?? [];

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage("en");
  });
});

for (const { code } of supportedLocales) {
  test(`${code} supplies every tutorial string and preserves all embedded controls`, () => {
    const translated = flatten(messages[code]);
    expect(Object.keys(translated).sort()).toEqual(Object.keys(english).sort());
    for (const [key, value] of Object.entries(translated)) {
      expect(value.trim(), key).not.toBe("");
      expect(tokens(value), key).toEqual(tokens(english[key]!));
    }
    for (const step of steps) {
      expect(translated[`.steps.${step.id}.title`]).toBeTruthy();
      expect(translated[`.steps.${step.id}.text`]).toBeTruthy();
    }
    if (code !== "en") expect(translated[".invite"]).not.toBe(english[".invite"]);
    expect(translated[".controls.static"]).toBe(motionMessages[code]!.static);
    expect(translated[".controls.motion"]).toBe(motionMessages[code]!.motion);
  });
}

test("a language change translates embedded keys, control icons, accessible copy and errors", async () => {
  await i18n.changeLanguage("fr");
  const { container } = render(<Speech text="{rightClick} · {zoom} · {effects}" />);
  await waitFor(() =>
    expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent("Clic droit"),
  );
  expect(container.querySelector('[data-slot="kbd-group"]')).toHaveTextContent("Molette");
  expect(container.querySelector(".tutorial-control")).toHaveTextContent("Ajouter un effet");
  expect(tutorialError("activeProject").message).toBe(messages.fr.errors.activeProject);
  await act(async () => {
    await i18n.changeLanguage("ar");
  });
  await waitFor(() =>
    expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent(
      "النقر بزر الفأرة الأيمن",
    ),
  );
  expect(container.querySelector('[data-slot="kbd-group"]')).toHaveAttribute("dir", "ltr");
  expect(container.querySelectorAll("[data-speech-cue] svg")).toHaveLength(2);
  expect(tutorialError("activeProject").message).toBe(ar.errors.activeProject);
});
