import { createRoot } from "react-dom/client";
import { useState } from "react";
import { EditorEngine, createProject, createPage } from "../../../packages/core/src/index";
import type { FillGradient } from "../../../packages/core/src/index";
import { StudioBackgroundPaint } from "../../../apps/web/src/ui/studio/background/StudioBackgroundPaint";
import "../../../apps/web/src/ui/studio/background/messages";
import "../../../apps/web/src/ui/studio/background/background.css";
import { StudioSlider } from "../../../apps/web/src/ui/studio/controls/StudioSlider";
import { NumberInput } from "../../../apps/web/src/components/shared/NumberInput";
import { TooltipProvider } from "../../../apps/web/src/components/ui/tooltip";
import { WorkspaceTheme } from "../../../apps/web/src/ui/brand/WorkspaceTheme";
import "../../../apps/web/src/styles/global.css";
import "../../../apps/web/src/ui/studio/studio-chrome.css";
import { i18n } from "../../../apps/web/src/state/i18n";

export async function mount() {
  await i18n.changeLanguage("en");
  const engine = new EditorEngine(createProject({ pages: [createPage()] }));
  const events = { previews: [] as number[], commits: [] as number[], cancels: 0 };
  function Controls() {
    const [value, setValue] = useState(10);
    const [gradient, setGradient] = useState<FillGradient>({
      kind: "linear",
      angle: 0,
      stops: [
        { offset: 0, color: "#24272C" },
        { offset: 1, color: "#F9F9F9" },
      ],
    });
    return (
      <WorkspaceTheme value="studio">
        <TooltipProvider>
          <div
            data-workspace-theme="studio"
            style={{ width: 180, margin: "150px 100px", padding: 10 }}
          >
            <StudioSlider
              label="Test value"
              min={0}
              max={100}
              step={1}
              value={value}
              resetValue={10}
              identity="owner"
              onPreview={(value) => events.previews.push(value)}
              onCommit={(value) => {
                events.commits.push(value);
                setValue(value);
              }}
              onCancel={() => {
                events.cancels++;
              }}
            />
            <NumberInput
              label="Intensity"
              value={value}
              min={0}
              max={100}
              step={1}
              onCommit={(value) => {
                events.commits.push(value);
                setValue(value);
              }}
            />
          </div>
          <div data-workspace-theme="studio" style={{ width: 300, margin: "20px 100px" }}>
            <StudioBackgroundPaint
              engine={engine}
              identity="paint"
              ownerId="paint"
              color="#24272C"
              gradient={gradient}
              preview={() => {}}
              commit={(paint) => {
                if (paint.gradient) setGradient(paint.gradient);
              }}
              cancel={() => {}}
              advanced={null}
            />
          </div>
        </TooltipProvider>
      </WorkspaceTheme>
    );
  }
  const root = createRoot(document.body.appendChild(document.createElement("div")));
  root.render(<Controls />);
  Object.assign(window, { __controls: events, __disposeControls: () => root.unmount() });
}
