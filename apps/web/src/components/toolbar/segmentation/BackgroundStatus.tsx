import { Check } from "lucide-react";
import { Throbber } from "../../ui/throbber/Throbber";

/** One stable status slot; the operation owns progress and completion. */
export function BackgroundStatus({
  busy,
  completed,
  label,
  completedLabel,
  step,
}: {
  busy: boolean;
  completed: boolean;
  label: string;
  completedLabel: string;
  step: string;
}) {
  return (
    <div className="background-phase">
      <div className="background-status-copy">
        <Throbber
          active={busy}
          delayMs={0}
          size={20}
          variant="shimmer"
          state="working"
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
