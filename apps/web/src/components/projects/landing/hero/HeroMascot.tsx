import { useEffect, useRef } from "react";
import { MeltMark } from "../../../../ui/brand/MeltMark";
import { installHeroMascot } from "./mascot-playback";

/** Critical hero playback is ready with the landing module; idle marks remain native. */
export function HeroMascot() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;
    return installHeroMascot(element);
  }, []);
  return (
    <div className="hero-mascot-stage" ref={host} aria-hidden>
      <div className="hero-mascot-landing">
        <div className="hero-mascot-turn">
          <MeltMark size={88} />
          <svg className="hero-mascot-face" viewBox="-116 -116 232 232" />
        </div>
      </div>
    </div>
  );
}
