import { useTranslation } from "react-i18next";
import "./messages";
import { useEffect, useRef, type ReactNode } from "react";
import { ChevronRight, Download, Mouse, Pin, Play, Plus, Sparkles } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { Kbd, KbdGroup } from "../../ui/kbd";
import { modifierLabel } from "../../search/shortcuts";

function speechCues(
  modifier: string,
  label: (key: string) => string,
): Record<string, { label: string; content: ReactNode }> {
  const control = (label: string, icon?: ReactNode) => ({
    label,
    content: (
      <span className="tutorial-control">
        {icon}
        {label}
      </span>
    ),
  });
  return {
    "{zoom}": {
      label: `${modifier} + ${label("wheel")}`,
      content: (
        <KbdGroup dir="ltr">
          <Kbd>{modifier}</Kbd>
          <Kbd>{label("wheel")}</Kbd>
        </KbdGroup>
      ),
    },
    "{rightClick}": {
      label: label("rightClick"),
      content: (
        <Kbd>
          <Mouse size={13} />
          {label("rightClick")}
        </Kbd>
      ),
    },
    "{add}": {
      label: label("add"),
      content: (
        <span className="tutorial-control">
          <Plus size={13} />
        </span>
      ),
    },
    "{effects}": {
      label: label("effects"),
      content: (
        <span className="tutorial-control">
          {label("effects")}
          <ChevronRight size={13} />
        </span>
      ),
    },
    "{dither}": control(label("dither")),
    "{static}": control(label("static")),
    "{motion}": control(label("motion")),
    "{animation}": control(label("animation"), <Sparkles size={13} />),
    "{pop}": control(label("pop")),
    "{pin}": control(label("pin"), <Pin size={13} />),
    "{play}": control(label("play"), <Play size={13} />),
    "{export}": control(label("export"), <Download size={13} />),
    "{video}": control(label("video")),
    "{exportVideo}": control(label("exportVideo"), <Download size={13} />),
  };
}

/** Reveal text without replacing the native shortcut components. */
export function Speech({ text }: { text: string }) {
  const { t, i18n } = useTranslation("editorTutorial");
  const language = i18n.resolvedLanguage;
  const host = useRef<HTMLParagraphElement>(null);
  const reduce = useReducedMotion();
  const modifier = modifierLabel();
  const cues = speechCues(modifier, (key) => t(`controls.${key}`));
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const parts = Array.from(node.children).map((element) => ({
      element: element as HTMLElement,
      text: element.getAttribute("data-speech-text") ?? element.textContent ?? "",
    }));
    if (reduce) {
      for (const part of parts) {
        if (part.element.hasAttribute("data-speech-cue")) part.element.style.visibility = "visible";
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
        if (part.element.hasAttribute("data-speech-cue"))
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
  }, [text, modifier, reduce, language]);
  const parts = text.split(/(\{[a-zA-Z]+\})/g);
  return (
    <>
      <p ref={host} aria-hidden="true" key={`${language}:${text}`}>
        {parts.map((part, index) =>
          cues[part] ? (
            <span key={index} data-speech-cue data-speech-text={cues[part].label}>
              {cues[part].content}
            </span>
          ) : (
            <span key={index} data-speech-text={part}>
              {part}
            </span>
          ),
        )}
      </p>
      <p className="sr-only" aria-live="polite">
        {parts.map((part) => cues[part]?.label ?? part).join("")}
      </p>
    </>
  );
}
