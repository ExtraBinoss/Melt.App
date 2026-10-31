import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { FontRenderIndicator } from "../../../../src/components/properties/fonts/FontRenderIndicator";
import "../../../../src/state/i18n";
import type { FontRenderState } from "../../../../src/state/session/font-presentation";

test("shows a discreet accessible indicator only while rendering or after failure", () => {
  const state: FontRenderState & { label: string } = {
    available: true,
    status: "pending",
    label: "Lora",
    ticket: {
      sequence: 3,
      projectId: "project",
      pageId: "page",
      revision: 2,
      layerId: "layer",
      family: "Lora",
      weight: 400,
      fontId: "lora",
    },
  };
  const view = render(<FontRenderIndicator state={state} />);
  expect(screen.getByLabelText("Rendu de Lora…")).toBeVisible();
  view.rerender(<FontRenderIndicator state={{ ...state, status: "ready" }} />);
  expect(view.container).toBeEmptyDOMElement();
  view.rerender(<FontRenderIndicator state={{ ...state, status: "error" }} />);
  expect(screen.getByLabelText("Impossible de prévisualiser Lora")).toBeVisible();
  view.rerender(<FontRenderIndicator />);
  expect(view.container).toBeEmptyDOMElement();
});
