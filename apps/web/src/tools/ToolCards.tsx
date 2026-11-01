import { ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TransitionLink } from "../ui/navigation/TransitionLink";
import { publicHref, toolPath, type ToolDefinition } from "./catalog";
import "./messages";
export function ToolCards({ tools }: { tools: readonly ToolDefinition[] }) {
  const { t } = useTranslation("tools");
  return (
    <div className="tool-cards">
      {tools.map((tool) => (
        <TransitionLink
          key={tool.slug}
          className="tool-card"
          data-style={tool.style}
          href={publicHref(toolPath(tool))}
          revealTarget={`[data-tool-route="${tool.style}"]`}
        >
          <div className="tool-card-image">
            <img
              src={publicHref(`/tools/previews/${tool.style}.webp`)}
              width={640}
              height={480}
              alt={t(`styles.${tool.style}.name`)}
              loading="lazy"
            />
          </div>
          <div className="tool-card-copy">
            <h2>{t(`styles.${tool.style}.name`)}</h2>
            <ArrowUpRight size={18} />
            <p>{t(`styles.${tool.style}.summary`)}</p>
          </div>
        </TransitionLink>
      ))}
    </div>
  );
}
