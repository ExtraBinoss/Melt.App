import { useRef, type ReactNode } from "react";
import { motion } from "motion/react";
import { TabsList, TabsTrigger } from "../../ui/tabs";
import { useTranslation } from "react-i18next";
import { RadioGroup } from "radix-ui";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import "./segmented.css";
import { useSegmentedIndicator } from "./use-indicator";

export interface SegmentedTab {
  value: string;
  label: string;
  icon?: ReactNode;
}
interface CommonProps {
  value: string;
  items: readonly SegmentedTab[];
  label: string;
  disabled?: boolean;
  size?: "default" | "compact";
  className?: string;
  itemClassName?: string;
  indicatorClassName?: string;
  tooltips?: boolean;
}
type Props = CommonProps &
  (
    | { mode?: "tabs"; onValueChange?: never }
    | { mode: "choice"; onValueChange: (value: string) => void }
  );
/** One shared Motion surface with genuine Radix tabs or an accessible single-value choice. */
export function SegmentedTabs({
  value,
  items,
  label,
  disabled = false,
  size = "default",
  className = "",
  itemClassName = "",
  indicatorClassName = "",
  mode = "tabs",
  tooltips = false,
  onValueChange,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const { i18n } = useTranslation(),
    direction = i18n.dir();
  const layoutKey = JSON.stringify([direction, items.map((item) => [item.value, item.label])]);
  const indicator = useSegmentedIndicator(root, value, layoutKey);
  const Trigger = mode === "choice" ? RadioGroup.Item : TabsTrigger;
  const buttons = items.map((item) => {
    const button = (
      <Trigger
        key={item.value}
        value={item.value}
        disabled={disabled}
        aria-label={item.label}
        data-segmented-value={item.value}
        className={`segmented-tab ${itemClassName}`}
      >
        {item.icon && (
          <span className="segmented-tab-icon" aria-hidden>
            {item.icon}
          </span>
        )}
        <span className="segmented-tab-label">{item.label}</span>
      </Trigger>
    );
    return tooltips ? (
      <Tooltip key={item.value}>
        <TooltipTrigger asChild>
          <span className="segmented-tab-tooltip">{button}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom">{item.label}</TooltipContent>
      </Tooltip>
    ) : (
      button
    );
  });
  const highlight = (
    <motion.span
      aria-hidden
      className={`segmented-tab-indicator ${indicatorClassName}`}
      style={indicator}
      data-segmented-indicator
    />
  );
  return mode === "choice" ? (
    <RadioGroup.Root
      ref={root}
      data-animation="wipe"
      dir={direction}
      value={value}
      onValueChange={onValueChange}
      orientation="horizontal"
      disabled={disabled}
      aria-label={label}
      className={`segmented-tabs ${className}`}
      data-size={size}
    >
      {highlight}
      {buttons}
    </RadioGroup.Root>
  ) : (
    <TabsList
      ref={root}
      data-animation="wipe"
      dir={direction}
      aria-label={label}
      className={`segmented-tabs ${className}`}
      data-size={size}
    >
      {highlight}
      {buttons}
    </TabsList>
  );
}
