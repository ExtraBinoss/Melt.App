import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { BackgroundGradientControl } from "../../../../src/components/properties/gradient/GradientControl";
import { GRADIENT_PRESETS } from "../../../../src/components/properties/gradient/presets";
import { setup } from "../../../support/ui";
import { useEngine, previewAtom } from "../../../../src/state/session/editor";
function mount() {
  const data = setup();
  const renders = vi.fn();
  function Live() {
    renders();
    const snapshot = useEngine(data.engine),
      page = snapshot.project.pages[0]!;
    return (
      <BackgroundGradientControl
        page={page}
        engine={data.engine}
        preview={(patch) => data.store.set(previewAtom, { target: "page", patch })}
        cancel={() => data.store.set(previewAtom, null)}
        patch={(patch) => {
          data.store.set(previewAtom, null);
          data.engine.execute({ type: "updatePage", patch });
        }}
      />
    );
  }
  data.mount(<Live />);
  return { ...data, renders, page: () => data.engine.getSnapshot().project.pages[0]! };
}
it("previews presets without document edits or parent renders, rolls back hover and commits one undo", async () => {
  const data = mount();
  fireEvent.click(screen.getByRole("radio", { name: "Dégradé" }));
  const original = data.page().backgroundGradient;
  fireEvent.click(screen.getByRole("button", { name: "Préréglages" }));
  const preset = await screen.findByRole("button", { name: "Dégradé 10" });
  expect(preset).toHaveAttribute("aria-pressed", "false");
  const renders = data.renders.mock.calls.length;
  fireEvent.pointerEnter(preset, { pointerType: "mouse" });
  expect(data.page().backgroundGradient).toEqual(original);
  expect(data.store.get(previewAtom)).toMatchObject({
    patch: { backgroundGradient: GRADIENT_PRESETS[9]!.paint },
  });
  expect(data.renders).toHaveBeenCalledTimes(renders);
  fireEvent.pointerLeave(preset.parentElement!.parentElement!);
  expect(data.store.get(previewAtom)).toBeNull();
  fireEvent.focus(preset);
  fireEvent.click(preset);
  expect(data.page().backgroundGradient).toEqual(GRADIENT_PRESETS[9]!.paint);
  act(() => data.engine.undo());
  expect(data.page().backgroundGradient).toEqual(original);
  act(() => data.engine.redo());
  expect(data.page().backgroundGradient).toEqual(GRADIENT_PRESETS[9]!.paint);
});
it("saves named paints through the shared user library and randomizes with one commit", async () => {
  const data = mount();
  fireEvent.click(screen.getByRole("radio", { name: "Dégradé" }));
  const original = data.page().backgroundGradient;
  fireEvent.click(screen.getByRole("button", { name: "Dégradé aléatoire" }));
  expect(data.page().backgroundGradient).not.toEqual(original);
  const selected = data.page().backgroundGradient;
  fireEvent.click(screen.getByRole("button", { name: "Préréglages" }));
  await waitFor(() => expect(document.querySelector('[aria-busy="false"]')).not.toBeNull());
  fireEvent.change(screen.getByRole("textbox", { name: "Nom du dégradé" }), {
    target: { value: "Personal" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer le dégradé" }));
  fireEvent.click(screen.getByRole("radio", { name: "Enregistrés" }));
  expect(await screen.findByRole("button", { name: "Personal" })).toBeVisible();
  expect(data.page().backgroundGradient).toEqual(selected);
  act(() => data.engine.undo());
  expect(data.page().backgroundGradient).toEqual(original);
  fireEvent.click(screen.getByRole("button", { name: "Supprimer Personal" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Personal" })).toBeNull());
});
