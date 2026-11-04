import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "../../../components/ui/button";

export function StudioDock({
  title,
  icon,
  className,
  children,
  initiallyOpen = true,
}: {
  title: string;
  icon: ReactNode;
  className: string;
  children: ReactNode;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const id = useId();
  return (
    <section className={`studio-dock ${className}`} aria-label={title} data-canvas-control>
      <Button
        variant="ghost"
        className="studio-dock-heading"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((current) => !current)}
      >
        {icon}
        <span>{title}</span>
        <ChevronDown className="studio-dock-chevron" size={14} aria-hidden />
      </Button>
      <div id={id} hidden={!open} className="studio-dock-content">
        {open && children}
      </div>
    </section>
  );
}
