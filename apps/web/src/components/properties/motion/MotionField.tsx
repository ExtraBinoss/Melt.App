import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { getMotionOccurrenceAt, type EnginePort, type MotionPropertyTarget } from "@musart/core";
import { useTranslation } from "react-i18next";
import { createMotionTransport } from "../../../services/motion/transport";
import { MotionDiamond } from "./MotionDiamond";
import { useMotionFieldEditor } from "./context";

export function MotionField({
  engine,
  target,
  targets,
  label,
  disabled,
  children,
  className = "",
  captureTarget = true,
}: {
  engine?: EnginePort;
  target?: MotionPropertyTarget;
  label: string;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
  targets?: readonly MotionPropertyTarget[];
  captureTarget?: boolean;
}) {
  const editor = useMotionFieldEditor();
  const { t } = useTranslation("motionProperties");
  const wrapper = useRef<HTMLFieldSetElement>(null);
  const input = useRef<HTMLDivElement>(null);
  const addressKey = target ? JSON.stringify(targets ?? [target]) : null;
  const addresses = useMemo(
    () => (addressKey ? (JSON.parse(addressKey) as MotionPropertyTarget[]) : null),
    [addressKey],
  );
  useLayoutEffect(() => {
    if (!engine || !addresses) return;
    const transport = createMotionTransport(engine);
    let previous: { blocked: boolean; absent: boolean } | undefined;
    const update = () => {
      const state = transport.read();
      let absent = false;
      if (state.mode === "motion") {
        const snapshot = engine.getSnapshot();
        const page = snapshot.project.pages.find((page) => page.id === snapshot.pageId)!;
        absent = addresses.some(
          (address) =>
            !getMotionOccurrenceAt(page, address.layerId, state.time, { terminalPreview: true }),
        );
      }
      const blocked = Boolean(disabled || absent);
      if (previous && blocked === previous.blocked && absent === previous.absent) return;
      previous = { blocked, absent };
      const field = wrapper.current;
      if (field) {
        const ariaDisabled = String(blocked);
        const title = absent ? t("inactive") : "";
        if (field.disabled !== blocked) field.disabled = blocked;
        if (field.getAttribute("aria-disabled") !== ariaDisabled)
          field.setAttribute("aria-disabled", ariaDisabled);
        if (field.title !== title) field.title = title;
      }
      if (input.current && input.current.inert !== blocked) input.current.inert = blocked;
    };
    update();
    return transport.subscribe(update);
  }, [engine, addresses, disabled, t]);
  if (!engine || !target) return children;
  return (
    <fieldset
      ref={wrapper}
      role="presentation"
      className={`motion-property-field ${className}`}
      onPointerDownCapture={(event) => {
        if (
          !event.currentTarget.disabled &&
          !(event.target as Element).closest("[data-motion-diamond],.motion-property-diamond-slot")
        )
          (editor?.start ?? editor?.begin)?.(captureTarget ? (targets ?? target) : undefined);
      }}
      onFocusCapture={(event) => {
        if (
          !event.currentTarget.disabled &&
          !(event.target as Element).closest("[data-motion-diamond],.motion-property-diamond-slot")
        )
          (editor?.start ?? editor?.begin)?.(captureTarget ? (targets ?? target) : undefined);
      }}
    >
      <div ref={input} className="motion-property-input">
        {children}
      </div>
      <MotionDiamond
        engine={engine}
        target={target}
        targets={targets}
        label={label}
        disabled={disabled}
      />
    </fieldset>
  );
}
