import { expect, test, vi } from "vitest";
import { screen } from "@testing-library/react";
import { AttachmentBody } from "../../../../src/components/layers/attachments/AttachmentBody";
import { setup } from "../../../support/ui";

test("a closed pending opening mounts no controls; an admitted editor remains through its exit", async () => {
  const d = setup();
  const executed = vi.fn();
  function Editor() {
    executed();
    return <input aria-label="Owned editor" />;
  }
  const content = <Editor />;
  const view = d.mount(
    <AttachmentBody generation={1} active={false} estimatedHeight={200}>
      {content}
    </AttachmentBody>,
  );
  expect(executed).not.toHaveBeenCalled();
  view.rerender(
    <AttachmentBody generation={1} active estimatedHeight={200}>
      {content}
    </AttachmentBody>,
  );
  const field = await screen.findByRole("textbox", { name: "Owned editor" });
  view.rerender(
    <AttachmentBody generation={1} active={false} estimatedHeight={200}>
      {content}
    </AttachmentBody>,
  );
  expect(field).toBeInTheDocument();
  view.rerender(
    <AttachmentBody key={2} generation={2} active={false} estimatedHeight={200}>
      {content}
    </AttachmentBody>,
  );
  expect(field).not.toBeInTheDocument();
});
