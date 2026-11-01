import { memo } from "react";
import { Eye, EyeOff, LockKeyhole, LockKeyholeOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { IconButton } from "../../shared/IconButton";

/** A sibling's document edit changes no lock/visibility pixels or control ownership. */
export const LayerRowActions = memo(function LayerRowActions({
  name,
  visible,
  ownLocked,
  parentLocked,
  locked,
  lockDescription,
  onLock,
  onVisibility,
}: {
  name: string;
  visible: boolean;
  ownLocked: boolean;
  parentLocked: boolean;
  locked: boolean;
  lockDescription: string;
  onLock: () => void;
  onVisibility: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="layer-actions"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <IconButton
        disabled={parentLocked}
        className={`layer-lock-button ${locked ? "is-locked" : ""}`}
        label={`${parentLocked ? lockDescription : t(ownLocked ? "unlock" : "lock")} · ${name}`}
        aria-description={locked ? lockDescription : undefined}
        onClick={onLock}
      >
        {locked ? <LockKeyhole size={14} /> : <LockKeyholeOpen size={12} />}
        {locked && (
          <span className="layer-lock-label" aria-hidden>
            {t("layerControls:lockedState")}
          </span>
        )}
      </IconButton>
      <IconButton
        disabled={parentLocked}
        label={`${t(visible ? "visible" : "hidden")} · ${name}`}
        onClick={onVisibility}
      >
        {visible ? <Eye size={13} /> : <EyeOff size={13} />}
      </IconButton>
    </div>
  );
});
