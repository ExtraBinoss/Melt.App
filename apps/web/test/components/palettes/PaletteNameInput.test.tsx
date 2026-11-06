import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { PaletteNameInput } from "../../../src/components/palettes/PaletteNameInput";
import { i18n } from "../../../src/state/i18n";
let reduced = false;
vi.mock("motion/react", () => ({ useReducedMotion: () => reduced }));
afterEach(() => {
  vi.useRealTimers();
  reduced = false;
});

test("keeps palette names empty while translating static reduced-motion examples", async () => {
  reduced = true;
  await i18n.changeLanguage("en");
  const onChange = vi.fn();
  const view = render(<PaletteNameInput value="" onChange={onChange} />);
  const input = screen.getByRole("textbox", { name: i18n.t("palettes:name") });
  expect(input).toHaveValue("");
  const names = i18n.t("palettes:nameSuggestions", { returnObjects: true }) as string[];
  expect(input).toHaveAttribute("placeholder", names[0]);
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "My brand" } });
  expect(onChange).toHaveBeenLastCalledWith("My brand");
  view.rerender(<PaletteNameInput value="My brand" disabled onChange={onChange} />);
  expect(input).toHaveValue("My brand");
  expect(input).toBeDisabled();
  view.rerender(<PaletteNameInput value="" onChange={onChange} />);
  await act(async () => i18n.changeLanguage("fr"));
  const translated = i18n.t("palettes:nameSuggestions", { returnObjects: true }) as string[];
  expect(input).toHaveAttribute("placeholder", translated[0]);
  expect(input).toHaveAttribute("aria-label", i18n.t("palettes:name"));
});
