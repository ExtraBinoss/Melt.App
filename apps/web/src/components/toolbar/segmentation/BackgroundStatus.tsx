import type { BrandState } from "../../../ui/brand/dahlia";
import { Check } from "lucide-react";
import { Throbber } from "../../ui/throbber/Throbber";

/** One stable status slot; the operation owns progress and completion. */
export function BackgroundStatus({
  busy,
  completed,
  label,
  completedLabel,
  step,
  state = "working",
  size = 20,
}: {
  busy: boolean;
  completed: boolean;
  label: string;
  completedLabel: string;
  step: string;
  state?: BrandState;
  size?: number;
}) {
  return (
    <div className="background-phase">
      <div className="background-status-copy">
        <Throbber
          active={busy}
          delayMs={0}
          size={size}
          variant="shimmer"
          state={state}
          label={label}
        />
        {completed && !busy && (
          <span className="background-completion" role="status">
            <span className="background-completion-mark" aria-hidden>
              <Check size={17} strokeWidth={2.5} />
            </span>
            {completedLabel}
          </span>
        )}
      </div>
      {busy && (
        <span className="background-step" dir="ltr">
          {step}
        </span>
      )}
    </div>
  );
}
