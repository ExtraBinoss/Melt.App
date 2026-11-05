import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { TextTool } from "../../../src/components/text/TextTool";
import { textInsertionModeAtom } from "../../../src/state/session/text-insertion";
import { toolAtom } from "../../../src/state/session/editor";
import { setup } from "../../support/ui";

test.each(["2d", "3d"] as const)(
  "the %s default opens a nonmodal choice and arms either text source without editing",
  (defaultMode) => {
    const d = setup();
    const original = d.engine.getSnapshot().project;
    d.mount(<TextTool defaultMode={defaultMode} />);
    fireEvent.click(screen.getByRole("button", { name: /^Texte$/ }));
    expect(
      screen.getByRole("button", {
        name: defaultMode === "2d" ? /^Texte 2D$/ : /^Texte 3D$/,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(document.body.style.pointerEvents).toBe("");
    fireEvent.click(screen.getByRole("button", { name: /^Texte 3D$/ }));
    expect(d.store.get(toolAtom)).toBe("text");
    expect(d.store.get(textInsertionModeAtom)).toBe("3d");
    expect(d.engine.getSnapshot().project).toBe(original);
    expect(screen.queryByRole("button", { name: /^Texte 2D$/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Texte$/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Texte 2D$/ }));
    expect(d.store.get(textInsertionModeAtom)).toBe("2d");
    act(() => d.store.set(toolAtom, "pointer"));
    expect(screen.getByRole("button", { name: /^Texte$/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  },
);
