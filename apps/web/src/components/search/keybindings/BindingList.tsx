import type { BindingCommand } from "../../../state/keybindings/registry";
import type { BindingSnapshot } from "../../../state/keybindings/model";
import { ScrollShadow } from "../../shared/scroll/ScrollShadow";
import { BindingRow } from "./BindingRow";
import { useBindingWindow } from "./use-binding-window";

export function BindingList({
  commands,
  snapshot,
  label,
  empty,
}: {
  commands: readonly BindingCommand[];
  snapshot: BindingSnapshot;
  label: string;
  empty: string;
}) {
  const { list: listRef, indexes, offsets, pin, focus } = useBindingWindow(commands);
  return (
    <ScrollShadow className="shortcut-settings-scroll">
      <div
        ref={listRef}
        className="binding-list scrollable-panel"
        role="list"
        aria-label={label}
        onFocusCapture={(event) => {
          const row = event.target.closest<HTMLElement>("[data-binding-index]");
          if (row) pin(Number(row.dataset.bindingIndex));
        }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) pin(null);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Tab" || event.ctrlKey || event.metaKey || event.altKey) return;
          const target = event.target as HTMLElement;
          if (target.closest('[data-recording="true"]')) return;
          const row = target.closest<HTMLElement>("[data-binding-index]");
          if (!row) return;
          const buttons = [...row.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
          if (target !== (event.shiftKey ? buttons[0] : buttons.at(-1))) return;
          const index = Number(row.dataset.bindingIndex) + (event.shiftKey ? -1 : 1);
          if (index < 0 || index >= commands.length) return;
          event.preventDefault();
          focus(index, event.shiftKey);
        }}
      >
        {commands.length ? (
          <div className="binding-window" style={{ height: offsets.at(-1) }}>
            {indexes.map((index) => (
              <div
                key={commands[index]!.id}
                className="binding-window-row"
                data-binding-index={index}
                data-binding-id={commands[index]!.id}
                style={{ top: offsets[index] }}
              >
                <BindingRow
                  command={commands[index]!}
                  snapshot={snapshot}
                  position={index + 1}
                  total={commands.length}
                />
              </div>
            ))}
          </div>
        ) : (
          <p>{empty}</p>
        )}
      </div>
    </ScrollShadow>
  );
}
