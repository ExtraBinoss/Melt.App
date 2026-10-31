import type { ComponentProps } from "react";
import { Spline } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/button";
import { ObjectToolbar } from "../shared/ObjectToolbar";
export function VectorEditEntry({
  onEdit,
  ...props
}: Omit<ComponentProps<typeof ObjectToolbar>, "children"> & { onEdit: () => void }) {
  const { t } = useTranslation("vectorEditor");
  return (
    <ObjectToolbar {...props}>
      <Button size="sm" onClick={onEdit}>
        <Spline size={13} />
        {t("edit")}
      </Button>
    </ObjectToolbar>
  );
}
