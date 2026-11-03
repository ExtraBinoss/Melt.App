import { i18n } from "../../../src/state/i18n";
import { beforeEach, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Speech } from "../../../src/components/onboarding/tutorial/Speech";

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

for (const [platform, modifier] of [
  ["MacIntel", "⌘"],
  ["Win32", "Ctrl"],
] as const) {
  test(`shortcut survives the text reveal on ${platform}`, async () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue(platform!);
    const { container } = render(<Speech text="Zoom around the pointer with {zoom}." />);
    const text = container.querySelector('p[aria-hidden="true"]')!;
    await waitFor(() =>
      expect(text).toHaveTextContent(`Zoom around the pointer with ${modifier}+Wheel.`),
    );
    expect(container.querySelectorAll('[data-slot="kbd"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-slot="kbd-separator"]')).toHaveLength(1);
    expect(screen.getByText(modifier!, { selector: '[data-slot="kbd"]' })).toBeInTheDocument();
  });
}

test("multiple control icons and mouse keys survive the reveal with readable accessible text", async () => {
  const { container } = render(
    <Speech text="Click {add}, choose {effects}, then use {rightClick} and {export}." />,
  );
  const cues = container.querySelectorAll<HTMLElement>("[data-speech-cue]");
  expect(cues).toHaveLength(4);
  await waitFor(() => {
    for (const cue of cues) expect(cue.style.visibility).toBe("visible");
  });
  expect(container.querySelectorAll("[data-speech-cue] svg")).toHaveLength(4);
  expect(container.querySelector('[data-slot="kbd"]')).toHaveTextContent("Right-click");
  expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent(
    "Click Add (+), choose Add effect, then use Right-click and Export.",
  );
});
