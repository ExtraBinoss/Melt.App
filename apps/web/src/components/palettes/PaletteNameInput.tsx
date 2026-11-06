import { useRef } from "react";
import { useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Input } from "../ui/input";
import { useTypewriterPlaceholder } from "../search/use-search-placeholder";
import "./messages";

export function PaletteNameInput({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation("palettes");
  const input = useRef<HTMLInputElement>(null);
  const reduced = Boolean(useReducedMotion());
  const suggestions = t("nameSuggestions", { returnObjects: true }) as string[];
  useTypewriterPlaceholder(input, suggestions, reduced, {
    suffix: "",
    pauseOnFocus: true,
    enabled: !disabled && !value,
  });
  return (
    <Input
      ref={input}
      aria-label={t("name")}
      placeholder={suggestions[0]}
      value={value}
      maxLength={100}
      autoComplete="off"
      disabled={disabled}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}
