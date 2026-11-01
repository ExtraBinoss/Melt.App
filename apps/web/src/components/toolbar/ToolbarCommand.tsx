import { memo } from "react";
import type { LucideIcon } from "lucide-react";
import { IconButton } from "../shared/IconButton";

/** History changes update only the affected button, retaining other command controls. */
export const ToolbarCommand = memo(function ToolbarCommand({
  id,
  label,
  shortcut,
  disabled,
  Icon,
  run,
}: {
  id: string;
  label: string;
  shortcut: string;
  disabled?: boolean;
  Icon: LucideIcon;
  run: (id: string) => void;
}) {
  return (
    <IconButton label={label} shortcut={shortcut} disabled={disabled} onClick={() => run(id)}>
      <Icon strokeWidth={1.65} />
    </IconButton>
  );
});
