import { Activity, useEffect, useMemo, type ReactNode } from "react";
import { atom, useAtom, useSetAtom } from "jotai";
import { useReducedMotion } from "motion/react";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { PalettePanel } from "../../../components/shared/motion/PalettePanel";
import type { ComponentProps } from "react";

type ContentProps = Omit<ComponentProps<typeof PopoverContent>, "children" | "forceMount">;

/** One bounded editor. Hidden Activity retains controls while stopping drafts, effects and portals. */
export function StudioPropertyPopover({
  trigger,
  children,
  openRequest,
  ...content
}: ContentProps & {
  trigger: ReactNode;
  children: ReactNode;
  openRequest?: object | null;
}) {
  const atoms = useMemo(() => ({ open: atom(false), prepared: atom(false) }), []);
  const reduced = Boolean(useReducedMotion());
  const [open, setOpen] = useAtom(atoms.open);
  const [prepared] = useAtom(atoms.prepared);
  const prepare = useSetAtom(atoms.prepared);
  useEffect(() => {
    if (!openRequest) return;
    prepare(true);
    setOpen(true);
  }, [openRequest, prepare, setOpen]);
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
          <PopoverContent {...content} forceMount initialFocus="content" asChild>
            <PalettePanel reduced={reduced} waitForPlacement blurred>
              {children}
            </PalettePanel>
          </PopoverContent>
        </Activity>
      )}
    </Popover>
  );
}
