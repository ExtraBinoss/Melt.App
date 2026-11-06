import { useLayoutEffect, useRef, useState } from "react";
import { Pipette } from "lucide-react";
import { useTranslation } from "react-i18next";
import "../properties/color/messages";
import { IconButton } from "../shared/IconButton";
import { pickScreenColor, supportsEyeDropper } from "../properties/color/eyedropper";

/** Reuse native color sampling; source changes and dismissal cancel the owned request. */
export function PaletteEyedropper({
  identity,
  disabled,
  onPick,
}: {
  identity: string;
  disabled: boolean;
  onPick: (color: string) => void;
}) {
  const { t } = useTranslation("color"),
    [available] = useState(supportsEyeDropper);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const request = useRef<AbortController | null>(null),
    latest = useRef(onPick);
  useLayoutEffect(() => {
    latest.current = onPick;
  });
  const [source, setSource] = useState({ identity, disabled });
  if (source.identity !== identity || source.disabled !== disabled) {
    setSource({ identity, disabled });
    setBusy(false);
    setError("");
  }
  useLayoutEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
    },
    [identity, disabled],
  );
  if (!available) return null;
  return (
    <>
      <IconButton
        label={t("sample")}
        tooltipSide="top"
        disabled={disabled || busy}
        onClick={() => {
          const owned = new AbortController();
          request.current?.abort();
          request.current = owned;
          setBusy(true);
          setError("");
          void pickScreenColor(owned.signal)
            .then(
              ({ sRGBHex }) => {
                if (request.current === owned && !owned.signal.aborted) latest.current(sRGBHex);
              },
              (reason: unknown) => {
                if (
                  request.current === owned &&
                  !owned.signal.aborted &&
                  !(reason instanceof DOMException && reason.name === "AbortError")
                )
                  setError(reason instanceof Error ? reason.message : String(reason));
              },
            )
            .finally(() => {
              if (request.current === owned) {
                request.current = null;
                setBusy(false);
              }
            });
        }}
      >
        <Pipette size={15} />
      </IconButton>
      {error && (
        <span role="alert" className="palette-error">
          {error}
        </span>
      )}
    </>
  );
}
