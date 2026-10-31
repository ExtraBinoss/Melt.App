import { expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createEffect } from "@musart/core";
import type { ToolState } from "../../../src/tools/converter/types";
import { i18n } from "../../../src/state/i18n";
import "../../../src/tools/messages";
import { findTool } from "../../../src/tools/catalog";
import { ToolWorkspace } from "../../../src/tools/converter/ToolWorkspace";

const harness = vi.hoisted(() => ({ controller: null as unknown }));
vi.mock("../../../src/tools/converter/lifecycle", () => ({
  createControllerSlot: () => ({
    read: () => harness.controller,
    subscribe: () => () => {},
    connect: () => () => {},
  }),
}));
vi.mock("../../../src/tools/converter/Transport", () => ({
  ToolTransport: () => <div data-testid="transport" />,
}));

for (const hasAudio of [false, true]) {
  test(`only audio-bearing sources expose Keep audio (${hasAudio}) and Advanced follows unchanged basic controls`, async () => {
    await i18n.changeLanguage("en");
    const state: ToolState = {
      phase: "ready",
      effect: createEffect("bit-dither"),
      name: "clip.webm",
      width: 160,
      height: 120,
      edge: 1280,
      sourceDuration: 2,
      clipStart: 0,
      clipLength: 2,
      hasAudio,
      keepAudio: hasAudio,
      playing: false,
      time: 0,
      comparing: false,
      progress: 0,
      error: null,
    };
    const audio = vi.fn();
    harness.controller = {
      read: () => state,
      subscribe: () => () => {},
      open: vi.fn(),
      audio,
      cancelPreview: vi.fn(),
    };
    render(
      <ToolWorkspace
        file={new File(["video"], "clip.webm", { type: "video/webm" })}
        tool={findTool("dither-video-converter")!}
        host={document.createElement("div")}
        onActivity={vi.fn()}
      />,
    );
    const keepAudio = screen.queryByRole("switch", { name: "Keep audio" });
    if (hasAudio) {
      expect(keepAudio).toBeEnabled();
      fireEvent.click(keepAudio!);
      expect(audio).toHaveBeenCalledExactlyOnceWith(false);
    } else expect(keepAudio).toBeNull();
    const contrast = screen.getByRole("textbox", { name: "Contrast" });
    const toggle = screen.getByRole("button", { name: "Advanced controls" });
    expect(contrast.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(4);
    expect(screen.queryByRole("textbox", { name: "Tone gamma" })).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("textbox", { name: "Contrast" })).toBe(contrast);
    const gamma = screen.getByRole("textbox", { name: "Tone gamma" });
    expect(toggle.compareDocumentPosition(gamma) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(4);
    expect(screen.getByRole("switch", { name: "Source colors" })).not.toBeChecked();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox", { name: "Tone gamma" })).toBeNull();
  });
}
