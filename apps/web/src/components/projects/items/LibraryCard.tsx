import type { ReactNode, ComponentPropsWithRef } from "react";
import { useTranslation } from "react-i18next";
import { Ellipsis } from "lucide-react";
import { ModeIcon } from "../../motion/ModeIcon";
import { Button } from "../../ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../../ui/dropdown-menu";
import "../templates/templates.css";
import "../templates/messages";
import "./card.css";

/** Projects and templates share their artwork, caption and action geometry. */
export function LibraryCard({
  kind,
  name,
  mode,
  width,
  height,
  preview,
  title,
  menu,
  active,
  onContextMenu,
  children,
  ...props
}: Omit<ComponentPropsWithRef<"article">, "title" | "children"> & {
  kind: "project" | "template";
  name: string;
  mode: "motion" | "static";
  width: number;
  height: number;
  preview: ReactNode;
  title: ReactNode;
  menu: ReactNode;
  active?: boolean;
  children?: ReactNode;
}) {
  const { t } = useTranslation("templates");
  return (
    <article
      {...props}
      className={`library-card template-card ${kind === "project" ? "project-card" : ""}`}
      aria-label={name}
      data-library-kind={kind}
      data-preview-owner
      data-active={active || undefined}
      aria-current={active ? "true" : undefined}
      onContextMenu={onContextMenu}
    >
      <div className="library-card-artwork">{preview}</div>
      <div className="library-card-caption">
        <div className="template-meta">
          <div className="template-title">{title}</div>
          <span className="template-size">
            {width} × {height} px
          </span>
        </div>
        <div className="library-card-actions">
          {menu}
          <span className="template-mode" data-mode={mode}>
            <ModeIcon mode={mode} size={14} />
            <span>{t(mode)}</span>
          </span>
        </div>
      </div>
      {children}
    </article>
  );
}
export function LibraryCardMenu({
  disabled,
  onOpenChange,
  actions,
}: {
  disabled: boolean;
  onOpenChange: () => void;
  actions: { label: string; run: () => void }[];
}) {
  const { t } = useTranslation("libraryItem");
  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className="project-options-trigger"
          disabled={disabled}
          aria-label={t("options")}
        >
          <Ellipsis size={15} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((action) => (
          <DropdownMenuItem key={action.label} disabled={disabled} onSelect={action.run}>
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
