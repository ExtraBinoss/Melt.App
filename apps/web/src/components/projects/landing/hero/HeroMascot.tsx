import { useEffect, useRef } from "react";
import { MeltMark } from "../../../../ui/brand/MeltMark";

/** The native mark is present in server HTML; the face engine enhances it after hydration. */
export function HeroMascot() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;
    let disposed = false;
    let dispose: (() => void) | undefined;
    void import("./mascot-playback").then(({ installHeroMascot }) => {
      if (!disposed) dispose = installHeroMascot(element);
    });
    return () => {
      disposed = true;
      dispose?.();
    };
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
