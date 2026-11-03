import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
/** Drive selection with a complete primary-pointer sequence, including focus and release. */
export async function choose(label: string, option: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name: option }));
}
