import type { ComponentProps } from "react";
import { DialogContent } from "../../ui/dialog";

/** The URL destination is inline/SSR-ready; the editor's project picker remains a genuine modal. */
export function DashboardSurface({
  standalone,
  titleId,
  descriptionId,
  ...props
}: ComponentProps<typeof DialogContent> & {
  standalone?: boolean;
  titleId: string;
  descriptionId: string;
  "data-welcome"?: boolean;
}) {
  if (!standalone) return <DialogContent {...props} />;
  return (
    <main
      data-slot="dialog-content"
      data-welcome={props["data-welcome"]}
      role="dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className={`fixed grid ${props.className ?? ""}`}
    >
      {props.children}
    </main>
  );
}
