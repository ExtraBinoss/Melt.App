import { Activity, useMemo, type ReactNode } from "react";
import { atom, useAtom, useSetAtom } from "jotai";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import type { ComponentProps } from "react";

type ContentProps = Omit<ComponentProps<typeof PopoverContent>, "children" | "forceMount">;

/** One bounded editor. Hidden Activity retains controls while stopping drafts, effects and portals. */
export function StudioPropertyPopover({
  trigger,
  children,
  ...content
}: ContentProps & {
  trigger: ReactNode;
  children: ReactNode;
}) {
  const atoms = useMemo(() => ({ open: atom(false), prepared: atom(false) }), []);
  const [open, setOpen] = useAtom(atoms.open);
  const [prepared] = useAtom(atoms.prepared);
  const prepare = useSetAtom(atoms.prepared);
  return (
    <Popover
      modal={false}
      open={open}
      onOpenChange={(value) => {
        if (value) prepare(true);
        setOpen(value);
      }}
    >
      <span
        style={{ display: "contents" }}
        onPointerEnter={() => prepare(true)}
        onFocusCapture={() => prepare(true)}
      >
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      </span>
      {prepared && (
        <Activity mode={open ? "visible" : "hidden"}>
          <PopoverContent {...content} forceMount initialFocus="content">
            {children}
          </PopoverContent>
        </Activity>
      )}
    </Popover>
  );
}
