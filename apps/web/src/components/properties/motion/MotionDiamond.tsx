import { memo, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { motionDiamondVisibility } from "./diamond-visibility";
import { Diamond } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  compareMotionTime,
  createLayerGeometryIndex,
  getMotionOccurrenceAt,
  resolveMotionProperty,
  type EnginePort,
  type MotionPropertyTarget,
  type MotionPropertyTrack,
  type MotionTime,
} from "@musart/core";
import { createMotionTransport } from "../../../services/motion/transport";
import {
  addMotionPropertyKeys,
  motionPropertyTrack,
  motionTargetKey,
} from "../../../state/session/motion-edit";
import { useEngineValue } from "../../../state/session/editor";
import { Button } from "../../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import "./messages";
import "./motion-properties.css";

function hasKeyAtTime(property: MotionPropertyTrack | undefined, time: MotionTime): boolean {
  const keys = property?.keyframes ?? [];
  let low = 0,
    high = keys.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1,
      comparison = compareMotionTime(keys[middle]!.time, time);
    if (comparison === 0) return true;
    if (comparison < 0) low = middle + 1;
    else high = middle - 1;
  }
  return false;
}

interface Props {
  engine: EnginePort;
  target: MotionPropertyTarget;
  targets?: readonly MotionPropertyTarget[];
  label: string;
  disabled?: boolean;
}
/** Document edits update the existing imperative binding; only address/owner/UI changes render it. */
export function MotionDiamond(props: Props) {
  const visibility = motionDiamondVisibility(props.engine);
  const visible = useSyncExternalStore(visibility.subscribe, visibility.read, visibility.read);
  return visible ? (
    <DiamondControl {...props} />
  ) : (
    <span className="motion-property-diamond-slot" hidden aria-hidden />
  );
}
const DiamondControl = memo(
  function DiamondControl({ engine, target, targets, label, disabled = false }: Props) {
    const ownerKey = useEngineValue(engine, (snapshot) =>
      JSON.stringify([snapshot.project.id, snapshot.pageId]),
    );
    const { t } = useTranslation("motionProperties");
    const button = useRef<HTMLButtonElement>(null);
    const wrapper = useRef<HTMLSpanElement>(null);
    const help = useRef("");
    const open = useRef(false);
    const [tooltip, setTooltip] = useState("");
    useLayoutEffect(() => {
      const transport = createMotionTransport(engine);
      const snapshot = engine.getSnapshot();
      const owner = { projectId: snapshot.project.id, pageId: snapshot.pageId };
      const addresses = targets ?? [target];
      let cachedPage: ReturnType<EnginePort["getSnapshot"]>["project"]["pages"][number] | undefined;
      let unavailable = false,
        locked = false;
      let properties: (MotionPropertyTrack | undefined)[] = [];
      let lastPresentation = "";
      const update = () => {
        const snapshot = engine.getSnapshot(),
          state = transport.read();
        const page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
        if (cachedPage !== page) {
          cachedPage = page;
          unavailable = addresses.some((address) => !resolveMotionProperty(page, address));
          const geometry = createLayerGeometryIndex(page);
          locked = addresses.some(
            (address) =>
              !page.layers.some((layer) => layer.id === address.layerId) ||
              geometry.isLocked(address.layerId),
          );
        }
        properties = addresses.map((address) =>
          motionPropertyTrack(page, address, { time: state.time }),
        );
        const absent = addresses.some(
          (address) =>
            !getMotionOccurrenceAt(page, address.layerId, state.time, { terminalPreview: true }),
        );
        const current =
          properties.length > 0 &&
          properties.every((property) => hasKeyAtTime(property, state.time));
        const animated = properties.some((property) => property?.keyframes.length);
        const node = button.current;
        if (!node) return;
        const blocked =
          disabled ||
          unavailable ||
          absent ||
          locked ||
          snapshot.project.id !== owner.projectId ||
          snapshot.pageId !== owner.pageId;
        const presentation = `${blocked}:${animated}:${current}:${unavailable}:${absent}`;
        if (presentation === lastPresentation) return;
        lastPresentation = presentation;
        if (wrapper.current) {
          wrapper.current.tabIndex = blocked ? 0 : -1;
        }
        node.disabled = blocked;
        node.dataset.animated = String(animated);
        node.dataset.current = String(current);
        node.setAttribute("aria-label", t(current ? "update" : "add", { property: label }));
        node.setAttribute("aria-pressed", String(current));
        help.current = unavailable
          ? t("macro")
          : absent
            ? t("inactive")
            : t(animated ? "armed" : "add", { property: label });
        if (open.current) setTooltip(help.current);
      };
      const stop = transport.subscribe(update);
      update();
      return stop;
    }, [engine, target, targets, label, disabled, ownerKey, t]);
    return (
      <Tooltip
        onOpenChange={(value) => {
          open.current = value;
          if (value) setTooltip(help.current);
        }}
      >
        <TooltipTrigger asChild>
          <span ref={wrapper} className="motion-property-diamond-slot">
            <Button
              ref={button}
              type="button"
              variant="ghost"
              size="icon-xs"
              className="motion-property-diamond"
              data-motion-diamond
              aria-label={t("add", { property: label })}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => addMotionPropertyKeys(engine, targets ?? [target])}
            >
              <Diamond size={11} aria-hidden />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{tooltip}</TooltipContent>
      </Tooltip>
    );
  },
  (before, after) =>
    before.engine === after.engine &&
    before.label === after.label &&
    Boolean(before.disabled) === Boolean(after.disabled) &&
    motionTargetKey(before.target) === motionTargetKey(after.target) &&
    (before.targets === after.targets ||
      Boolean(
        before.targets &&
        after.targets &&
        before.targets.length === after.targets.length &&
        before.targets.every(
          (target, index) => motionTargetKey(target) === motionTargetKey(after.targets![index]!),
        ),
      )),
);
