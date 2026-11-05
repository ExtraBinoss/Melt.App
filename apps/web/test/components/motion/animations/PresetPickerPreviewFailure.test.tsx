import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PresetPicker } from "../../../../src/components/motion/animations/PresetPicker";
import { setup } from "../../../support/ui";
import { MotionPresetStore } from "../../../../src/services/motion/animations/presets";

vi.mock("../../../../src/components/motion/animations/PresetGrid", () => ({
  PresetGrid: ({ onError, onReady }: { onError(): void; onReady?(): void }) => (
    <>
      <button onClick={onError}>Fail preview</button>
      <button>Hover another card</button>
      <button onClick={onReady}>Present preview frame</button>
    </>
  ),
}));

it("reports a genuine rendering failure separately from preset persistence", () => {
  const d = setup();
  d.mount(<PresetPicker engine={d.engine} apply={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Fail preview" }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Impossible d’afficher l’aperçu de cette animation. Réessaie.",
  );
  expect(screen.getByRole("alert")).not.toHaveTextContent("enregistrer ou de charger");
  fireEvent.click(screen.getByRole("button", { name: "Hover another card" }));
  expect(screen.getByRole("alert")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Present preview frame" }));
  expect(screen.queryByRole("alert")).toBeNull();
});

it("keeps a storage failure visible after a successful preview frame", async () => {
  const list = vi
    .spyOn(MotionPresetStore.prototype, "list")
    .mockRejectedValueOnce(Error("Storage unavailable"));
  try {
    const d = setup();
    d.mount(<PresetPicker engine={d.engine} apply={() => {}} />);
    fireEvent.click(screen.getByRole("radio", { name: "Mes presets" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Impossible d’enregistrer ou de charger ce preset.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Fail preview" }));
    expect(screen.getAllByRole("alert")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Present preview frame" }));
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Impossible d’enregistrer ou de charger ce preset.",
    );
  } finally {
    list.mockRestore();
  }
});
