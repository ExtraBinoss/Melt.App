import { Plus, Minus, Focus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/button";

export function VectorZoom({
  onIn,
  onOut,
  onFit,
}: {
  onIn: () => void;
  onOut: () => void;
  onFit: () => void;
}) {
  const { t } = useTranslation("vectorEditor");
  const actions = [
    { label: "zoomOut", Icon: Minus, action: onOut },
    { label: "fit", Icon: Focus, action: onFit },
    { label: "zoomIn", Icon: Plus, action: onIn },
  ];
  return (
    <div className="vector-zoom-controls">
      {actions.map(({ label, Icon, action }) => (
        <Button key={label} variant="outline" size="icon-sm" aria-label={t(label)} onClick={action}>
          <Icon size={16} />
        </Button>
      ))}
    </div>
  );
}
