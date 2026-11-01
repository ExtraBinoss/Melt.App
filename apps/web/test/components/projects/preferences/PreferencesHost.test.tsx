import { act, render, screen, waitFor } from "@testing-library/react";
import { Provider, atom, createStore } from "jotai";
import { expect, test, vi } from "vitest";
const mounted = vi.hoisted(() => vi.fn());
vi.mock("../../../../src/components/projects/preferences/PreferencesDialog", () => ({
  PreferencesDialog: ({ open }: { open?: boolean }) => {
    mounted(open);
    return <div data-open={String(open)}>Preferences loaded</div>;
  },
}));
import { PreferencesHost } from "../../../../src/components/projects/preferences/PreferencesHost";

test("unopened preferences do not mount; closing retains the dialog's exit lifecycle", async () => {
  const state = atom(false),
    store = createStore();
  const view = render(
    <Provider store={store}>
      <PreferencesHost state={state} />
    </Provider>,
  );
  expect(mounted).not.toHaveBeenCalled();
  expect(screen.queryByText("Preferences loaded")).toBeNull();
  act(() => store.set(state, true));
  await waitFor(() =>
    expect(screen.getByText("Preferences loaded")).toHaveAttribute("data-open", "true"),
  );
  act(() => store.set(state, false));
  expect(screen.getByText("Preferences loaded")).toHaveAttribute("data-open", "false");
  view.unmount();
});
