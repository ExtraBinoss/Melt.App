import { useDeferredValue, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Throbber } from "../../ui/throbber/Throbber";
import "./attachment-body.css";

/** The native surface/focus appears first; React can yield while its controls mount. */
export function AttachmentBody({
  generation,
  active,
  estimatedHeight,
  children,
}: {
  generation: number;
  active: boolean;
  estimatedHeight: number;
  children: ReactNode;
}) {
  const deferred = useDeferredValue(active ? generation : 0, 0);
  const [admitted, setAdmitted] = useState(false);
  const ready = admitted || (active && deferred === generation);
  if (ready && !admitted) setAdmitted(true);
  const { t } = useTranslation("brand");
  return ready ? (
    <div className="attachment-controls-ready" data-attachment-ready>
      {children}
    </div>
  ) : (
    <div
      className="attachment-controls-loading"
      aria-busy="true"
      style={{
        minHeight: `min(${estimatedHeight}px, calc(var(--attachment-available-height, 400px) - 28px))`,
      }}
    >
      <Throbber variant="dots" size={28} label={t("preparing")} delayMs={0} />
    </div>
  );
}
