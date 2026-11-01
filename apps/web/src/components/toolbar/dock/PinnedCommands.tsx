import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtom, useSetAtom, useStore } from "jotai";
import { DropCue } from "../../layers/drag/DropCue";
import { useTranslation } from "react-i18next";
import { Separator } from "../../ui/separator";
import type { SearchItem } from "../../search/catalog/model";
import { getSearchIcon } from "../../search/icons";
import { modifierLabel } from "../../search/shortcuts";
import { DockCustomizer } from "./DockCustomizer";
import { PinnedCommand } from "./PinnedCommand";
import { dockCommandsAtom, initializeDockAtom } from "./preferences";
import { useDockDrag } from "./use-dock-drag";
import "./messages";
import "./dock.css";
export function PinnedCommands({
  commands,
  run,
}: {
  commands: readonly SearchItem[];
  run: (id: string) => void;
}) {
  const { t } = useTranslation(),
    [ids, setIds] = useAtom(dockCommandsAtom),
    initialize = useSetAtom(initializeDockAtom);
  const [announcement, setAnnouncement] = useState("");
  const store = useStore(),
    group = useRef<HTMLDivElement>(null),
    focusAfterUnpin = useRef<number | null>(null);
  const drag = useDockDrag(ids, commands);
  const catalog = useMemo(
    () => new Map(commands.map((command) => [command.id, command])),
    [commands],
  );
  useEffect(() => {
    initialize();
  }, [initialize]);
  useEffect(() => {
    if (focusAfterUnpin.current === null) return;
    const rows = group.current?.querySelectorAll<HTMLElement>("[data-dock-command]");
    const row = rows?.[Math.min(focusAfterUnpin.current, rows.length - 1)];
    focusAfterUnpin.current = null;
    (
      row?.querySelector<HTMLButtonElement>("button:not([disabled])") ??
      row ??
      group.current
    )?.focus();
  }, [ids]);
  const { cancel, drop: finishDrop, start, over } = drag;
  const drop = useCallback(
    (event: Parameters<typeof finishDrop>[0]) => {
      if (finishDrop(event)) setAnnouncement(t("dock:reordered"));
    },
    [finishDrop, t],
  );
  const changePins = useCallback(
    (value: string[]) => {
      cancel();
      setIds(value);
    },
    [cancel, setIds],
  );
  const unpin = useCallback(
    (id: string, label: string) => {
      cancel();
      const current = store.get(dockCommandsAtom);
      focusAfterUnpin.current = current.indexOf(id);
      setIds(current.filter((value) => value !== id));
      setAnnouncement(t("dock:unpinned", { name: label }));
    },
    [cancel, store, setIds, t],
  );
  return (
    <>
      {drag.ids.length > 0 && <Separator />}
      <div
        ref={group}
        className="dock-pinned"
        aria-label={t("dock:pinned")}
        role="group"
        tabIndex={-1}
        onDragOver={drag.overViewport}
        onDragEnter={drag.overViewport}
        onDrop={drop}
      >
        {ids.map((id) => {
          const command = catalog.get(id);
          if (!command) return null;
          return (
            <PinnedCommand
              key={id}
              id={id}
              label={command.label}
              disabled={Boolean(command.disabled)}
              shortcut={command.shortcut
                ?.map((key) => (key === "Mod" ? modifierLabel() : key))
                .join("+")}
              Icon={getSearchIcon(command)}
              dragging={drag.dragging === id}
              position={drag.target?.id === id ? drag.target.position : undefined}
              start={start}
              over={over}
              cancel={cancel}
              drop={drop}
              run={run}
              unpin={unpin}
            />
          );
        })}
      </div>
      {drag.target && (
        <DropCue key={drag.target.id} anchor={drag.anchor} position={drag.target.position} />
      )}
      <Separator />
      <DockCustomizer ids={ids} commands={commands} onChange={changePins} />
      {announcement && (
        <span className="sr-only" role="status">
          {announcement}
        </span>
      )}
    </>
  );
}
