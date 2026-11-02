import { ChevronDown, Plus, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/button";
import { ButtonGroup } from "../../ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import "./messages";

/** One creation action with a separate, accessible portable-import menu. */
export function ProjectCreateActions({
  label,
  disabled,
  onCreate,
  onImport,
}: {
  label: string;
  disabled: boolean;
  onCreate: () => void;
  onImport: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ButtonGroup className="dashboard-create-group" aria-label={t("dashboard:createActions")}>
      <Button className="dashboard-create-primary" size="sm" disabled={disabled} onClick={onCreate}>
        <Plus size={14} />
        {label}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon-sm"
            className="dashboard-create-options"
            disabled={disabled}
            aria-label={t("dashboard:createActions")}
          >
            <ChevronDown size={15} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={disabled} onSelect={onImport}>
            <Upload size={14} />
            {t("dashboard:import")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  );
}
