import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ProjectDialog } from "../../../../src/components/projects/ProjectDialog";
import * as gallery from "../../../../src/components/projects/gallery/ProjectGallery";
import * as favorites from "../../../../src/services/projects/library/favorites";
import { setup } from "../../../support/ui";

test("creation visibility stays in its leaf and Escape restores the library opener", async () => {
  const d = setup();
  // Settle unrelated favorite hydration and the gallery's loaded-summary effect before
  // counting work caused by opening the accessory.
  vi.spyOn(favorites, "readLibraryFavorites").mockResolvedValue([]);
  const renderGallery = vi.spyOn(gallery, "ProjectGallery");
  d.mount(<ProjectDialog services={d.services} onTask={d.onTask} onClose={vi.fn()} />);
  await screen.findByText("Aucun projet enregistré.");
  await act(async () => {
    await Promise.resolve();
  });
  const opener = screen.getByRole("button", { name: "Nouveau projet" });
  opener.focus();
  const before = renderGallery.mock.calls.length;
  fireEvent.click(opener);
  const name = screen.getByLabelText("Nom");
  expect(name).toHaveFocus();
  expect(renderGallery.mock.calls).toHaveLength(before);
  fireEvent.keyDown(name, { key: "Escape" });
  await waitFor(() => expect(screen.queryByLabelText("Nom")).toBeNull());
  await waitFor(() => expect(opener).toHaveFocus());
  expect(renderGallery.mock.calls).toHaveLength(before);
  expect(d.services.createProject).not.toHaveBeenCalled();
});

test("direct creation blocks repeat submits and dismissal, then allows retry after failure", async () => {
  const d = setup(),
    close = vi.fn();
  let reject!: (error: Error) => void;
  vi.mocked(d.services.createProject).mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, fail) => {
        reject = fail;
      }),
  );
  d.mount(
    <ProjectDialog
      initialView="newProject"
      services={d.services}
      onTask={d.onTask}
      onClose={close}
    />,
  );
  const form = screen.getByLabelText("Nom").closest("form")!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(d.services.createProject).toHaveBeenCalledOnce();
  expect(screen.getByRole("combobox", { name: "Couleurs de sortie du canvas" })).toBeDisabled();
  expect(screen.getByLabelText("Nom")).toBeDisabled();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(close).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Fermer" })).toBeNull();
  await act(async () => reject(new Error("Storage unavailable")));
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Nom")).toBeEnabled();
  fireEvent.submit(form);
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(d.services.createProject).toHaveBeenCalledTimes(2);
  expect(d.services.listProjectPage).not.toHaveBeenCalled();
});
