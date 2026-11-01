import { expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Speech } from "../../../src/components/onboarding/tutorial/Speech";

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
    expect(screen.getByText(modifier!, { selector: '[data-slot="kbd"]' })).toBeInTheDocument();
  });
}
