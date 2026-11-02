import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { Kbd, KbdGroup } from "../../ui/kbd";
import { modifierLabel } from "../../search/shortcuts";

/** Reveal text without replacing the native shortcut components. */
export function Speech({ text }: { text: string }) {
  const host = useRef<HTMLParagraphElement>(null);
  const reduce = useReducedMotion();
  const modifier = modifierLabel();
  const shortcut = text.includes("{rightClick}") ? "Right-click" : modifier;
  const token = text.includes("{rightClick}") ? "{rightClick}" : "{zoom}";
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const parts = Array.from(node.children).map((element) => ({
      element: element as HTMLElement,
      text: element.getAttribute("data-speech-text") ?? element.textContent ?? "",
    }));
    if (reduce) {
      for (const part of parts) {
        if (part.element.hasAttribute("data-shortcut")) part.element.style.visibility = "visible";
        else part.element.textContent = part.text;
      }
      return;
    }
    let count = 0;
    const total = parts.reduce((sum, part) => sum + part.text.length, 0);
    function paint() {
      let offset = 0;
      for (const part of parts) {
        const visible = Math.max(0, count - offset);
        if (part.element.hasAttribute("data-shortcut"))
          part.element.style.visibility = visible ? "visible" : "hidden";
        else part.element.textContent = part.text.slice(0, visible);
        offset += part.text.length;
      }
    }
    paint();
    const timer = setInterval(() => {
      count += 5;
      paint();
      if (count >= total) clearInterval(timer);
    }, 12);
    return () => clearInterval(timer);
  }, [text, modifier, reduce]);
  const parts = text.split(token);
  return (
    <>
      <p ref={host} aria-hidden="true" key={text}>
        <span data-speech-text={parts[0]}>{parts[0]}</span>
        {parts.length > 1 && (
          <>
            <span data-shortcut>
              <KbdGroup>
                <Kbd>{shortcut}</Kbd>
                {token === "{zoom}" && (
                  <>
                    <span>+</span>
                    <Kbd>Wheel</Kbd>
                  </>
                )}
              </KbdGroup>
            </span>
            <span data-speech-text={parts[1]}>{parts[1]}</span>
          </>
        )}
      </p>
      <p className="sr-only" aria-live="polite">
        {text.replace(token, token === "{zoom}" ? `${modifier} + wheel` : "Right-click")}
      </p>
    </>
  );
}
