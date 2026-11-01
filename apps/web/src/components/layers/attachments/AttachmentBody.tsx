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
  return (
    <div
      className="attachment-controls-body"
      data-attachment-body
      style={{
        // Include the same viewport padding/border budget before and after admission.
        // A Radix available-height variable is only known after initial placement.
        height: `min(${Math.max(0, estimatedHeight - 30)}px, calc(100dvh - 62px))`,
      }}
    >
      {ready ? (
        <div className="attachment-controls-ready" data-attachment-ready>
          {children}
        </div>
      ) : (
        <div className="attachment-controls-loading" aria-busy="true">
          <Throbber variant="dots" size={28} label={t("preparing")} delayMs={0} />
        </div>
      )}
    </div>
  );
}
