import { Throbber } from "../../components/ui/throbber/Throbber";
import type { BrandActivity } from "./playback";
/** Decorative status beside an owner's existing accessible loading label. */
export function BrandStatus({
  size = 24,
  activity,
  state = "loading",
}: {
  size?: number;
  state?: "loading" | "preparing";
  activity?: BrandActivity;
}) {
  return (
    <span className="melt-status" aria-hidden>
      <Throbber size={size} activity={activity} state={state} decorative delayMs={0} />
    </span>
  );
}
