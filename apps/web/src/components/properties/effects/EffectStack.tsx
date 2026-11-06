import { ArrowDown, ArrowUp, Ellipsis, Trash2 } from "lucide-react";
import { getEffectDefinition, type Effect, type EnginePort } from "@musart/core";
import { useTranslation } from "react-i18next";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "../../ui/accordion";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../../ui/dropdown-menu";
import { IconButton } from "../../shared/IconButton";
import { Switch } from "../../ui/switch";
import { EffectParameters } from "./EffectParameters";
import "./effect-stack.css";
import { SaveTreatment } from "./presets/SaveTreatment";

/** The same compact, keyboard-accessible effect stack in either workspace. */
export function EffectStack({
  effects,
  engine,
  layerId,
  disabled = false,
  value,
  onValueChange,
  onUpdate,
  onChange,
  onStart,
  onCancel,
}: {
  effects: readonly Effect[];
  engine?: EnginePort;
  layerId?: string;
  disabled?: boolean;
  value: string;
  onValueChange: (value: string) => void;
  onUpdate: (effect: Effect, patch: Partial<Effect>, preview?: boolean) => void;
  onChange: (effects: Effect[]) => void;
  onStart?: () => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  function move(index: number, direction: -1 | 1) {
    const next = [...effects];
    next.splice(index + direction, 0, next.splice(index, 1)[0]!);
    onChange(next);
  }
  return (
    <>
      <div className="effect-stack-library-save">
        <SaveTreatment engine={engine} effects={effects} kind="stack" disabled={disabled} />
      </div>
      <Accordion
        type="single"
        collapsible
        value={value}
        onValueChange={(next) => {
          onCancel?.();
          onValueChange(next);
        }}
        className="effect-stack"
      >
        {effects.map((effect, index) => {
          const definition = getEffectDefinition(effect.type);
          if (definition.retired) return null;
          return (
            <AccordionItem
              key={effect.id}
              value={effect.id}
              className={`effect-card effect-stack-card ${!effect.enabled ? "effect-disabled" : ""}`}
            >
              <div className="effect-stack-heading">
                <AccordionTrigger>
                  <strong>{t(definition.nameKey)}</strong>
                </AccordionTrigger>
                <Switch
                  checked={effect.enabled}
                  disabled={disabled}
                  aria-label={t(effect.enabled ? "disableEffect" : "enableEffect")}
                  onCheckedChange={(enabled) => onUpdate(effect, { enabled })}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <IconButton
                      label={`${t(definition.nameKey)} · ${t("effectControls:actions")}`}
                      disabled={disabled}
                    >
                      <Ellipsis size={16} aria-hidden />
                    </IconButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      disabled={disabled || index === 0}
                      onSelect={() => move(index, -1)}
                    >
                      <ArrowUp size={14} aria-hidden />
                      {t("moveEffectUp")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={disabled || index === effects.length - 1}
                      onSelect={() => move(index, 1)}
                    >
                      <ArrowDown size={14} aria-hidden />
                      {t("moveEffectDown")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={disabled}
                      onSelect={() => {
                        onCancel?.();
                        onChange(effects.filter((item) => item.id !== effect.id));
                      }}
                    >
                      <Trash2 size={14} aria-hidden />
                      {t("removeEffect")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <AccordionContent className="effect-stack-body">
                <EffectParameters
                  engine={engine}
                  layerId={layerId}
                  effect={effect}
                  disabled={disabled || !effect.enabled}
                  onStart={onStart}
                  onChange={(patch, preview) => onUpdate(effect, patch, preview)}
                  onCancel={onCancel}
                />
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </>
  );
}
