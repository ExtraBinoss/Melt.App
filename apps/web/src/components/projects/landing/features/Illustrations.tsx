import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDownToLine,
  ArrowUpRight,
  ChevronDown,
  Code2,
  Download,
  Eye,
  FolderOpen,
  Image,
  Layers,
  Maximize,
  MousePointer2,
  Plus,
  Redo2,
  Type,
  Undo2,
  Volume2,
  X,
} from "lucide-react";
import { MeltMark } from "../../../../ui/brand/MeltMark";
import { Button } from "../../../ui/button";
import { Input } from "../../../ui/input";
import { Label } from "../../../ui/label";
import { Switch } from "../../../ui/switch";
import { Kbd } from "../../../ui/kbd";
import { SelectField } from "../../../shared/SelectField";
import media from "../media/manifest.json";
import "../../../export/messages";
import "../../templates/messages";

const unchanged = () => {};
const poster = (id: keyof typeof media) => `${import.meta.env.BASE_URL}${media[id].poster}`;

/** The product's own controls, arranged as inert editorial crops of the interface. */
function Interface({ children, kind }: { children: ReactNode; kind: string }) {
  return (
    <div className={`real-feature real-feature-${kind}`} inert aria-hidden="true">
      {children}
    </div>
  );
}

function Artwork({ id, className = "" }: { id: keyof typeof media; className?: string }) {
  return (
    <img
      className={`real-feature-image ${className}`}
      src={poster(id)}
      width={media[id].width}
      height={media[id].height}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  );
}

function ValueField({ label, value }: { label: string; value: string }) {
  return (
    <div className="real-feature-value">
      <span>{label}</span>
      <Input value={value} readOnly tabIndex={-1} aria-label={label} />
    </div>
  );
}

export function CanvasIllustration() {
  const { t } = useTranslation(undefined, { lng: "en" });
  return (
    <Interface kind="canvas">
      <div className="real-feature-window real-feature-editor">
        <header className="real-feature-bar">
          <MeltMark size={22} loading="lazy" />
          <Button size="xs" variant="ghost" className="real-feature-project">
            {t("templates:bloomWindows")} <ChevronDown />
          </Button>
          <span className="real-feature-spacer" />
          <Button size="icon-xs" variant="ghost" aria-label={t("undo")}>
            <Undo2 />
          </Button>
          <Button size="icon-xs" variant="ghost" aria-label={t("redo")}>
            <Redo2 />
          </Button>
          <Button size="xs">
            <ArrowUpRight />
            {t("export")}
          </Button>
        </header>
        <div className="real-feature-editor-body">
          <div className="real-feature-canvas-stage">
            <div className="real-feature-artboard">
              <Artwork id="bloom-windows" />
              <span className="real-feature-selection">
                <i />
                <i />
                <i />
                <i />
              </span>
            </div>
            <div className="real-feature-toolbox">
              <Button size="icon-xs" variant="secondary" aria-label={t("pointer")}>
                <MousePointer2 />
              </Button>
              <Button size="icon-xs" variant="ghost" aria-label={t("text")}>
                <Type />
              </Button>
              <Button size="icon-xs" variant="ghost" aria-label={t("import")}>
                <Image />
              </Button>
              <Button size="icon-xs" variant="ghost" aria-label={t("addLayer")}>
                <Plus />
              </Button>
            </div>
            <div className="real-feature-zoom">
              <Button size="xs" variant="ghost">
                100% <ChevronDown />
              </Button>
              <Button size="icon-xs" variant="ghost" aria-label={t("fitView")}>
                <Maximize />
              </Button>
            </div>
          </div>
          <aside className="real-feature-inspector">
            <div className="real-feature-panel-heading">
              {t("properties")}
              <Layers size={12} />
            </div>
            <div className="real-feature-inspector-section">
              <span className="real-feature-caption">{t("position")}</span>
              <div className="real-feature-value-grid">
                <ValueField label="X" value="120" />
                <ValueField label="Y" value="80" />
              </div>
              <div className="real-feature-value-grid">
                <ValueField label="W" value="1920" />
                <ValueField label="H" value="1080" />
              </div>
            </div>
            <div className="real-feature-inspector-section">
              <div className="real-feature-setting">
                <span>{t("opacity")}</span>
                <span>100%</span>
              </div>
              <SelectField
                label={t("blendMode")}
                value="normal"
                options={[{ value: "normal", label: t("normal") }]}
                onValueChange={unchanged}
                prewarm={false}
              />
            </div>
            <div className="real-feature-inspector-section real-feature-layer-section">
              <span className="real-feature-caption">{t("layers")}</span>
              <Button variant="secondary" size="xs">
                <Type />
                BLOOM.exe
                <Eye />
              </Button>
              <Button variant="ghost" size="xs">
                <Image />
                {t("image")}
                <Eye />
              </Button>
              <Button variant="ghost" size="xs">
                <Layers />
                {t("background")}
                <Eye />
              </Button>
            </div>
          </aside>
        </div>
      </div>
    </Interface>
  );
}

export function AgentIllustration() {
  const { t } = useTranslation(undefined, { lng: "en" });
  return (
    <Interface kind="agent">
      <div className="real-feature-window real-feature-command-window">
        <header className="real-feature-bar">
          <Code2 size={14} />
          <span>commands.json</span>
          <span className="real-feature-spacer" />
          <span className="real-feature-filetype">JSON</span>
        </header>
        <div className="real-feature-command-body">
          <div className="real-feature-command-file">
            <FolderOpen size={14} />
            <Input value="bloom.musart" readOnly tabIndex={-1} aria-label={t("projectName")} />
            <Kbd>.musart</Kbd>
          </div>
          <pre className="real-feature-code">
            <code>
              <span className="real-feature-code-line">
                1 <span>[</span>
              </span>
              <span className="real-feature-code-line">
                2 <span>{"{"}</span>
              </span>
              <span className="real-feature-code-line">
                3 <b>"type"</b>: <em>"updatePage"</em>,
              </span>
              <span className="real-feature-code-line">
                4 <b>"patch"</b>: <span>{"{"}</span>
                <b>"name"</b>: <em>"Bloom"</em>
                <span>{"}"}</span>
              </span>
              <span className="real-feature-code-line">
                5 <span>{"}"}</span>
              </span>
              <span className="real-feature-code-line">
                6 <span>]</span>
              </span>
            </code>
          </pre>
        </div>
      </div>
      <div className="real-feature-window real-feature-agent-preview">
        <header className="real-feature-bar">
          <span>Bloom</span>
          <span className="real-feature-spacer" />
          <Image size={12} />
        </header>
        <div className="real-feature-agent-artwork">
          <Artwork id="bloom-windows" />
        </div>
        <div className="real-feature-agent-preview-footer">
          <span>1920 × 1080</span>
          <span>.musart</span>
        </div>
      </div>
      <div className="real-feature-mascot">
        <MeltMark size={82} loading="lazy" />
      </div>
    </Interface>
  );
}

export function ExportIllustration() {
  const { t } = useTranslation(undefined, { lng: "en" });
  return (
    <Interface kind="export">
      <div className="real-feature-window real-feature-export-window">
        <header className="real-feature-bar">
          <Download size={13} />
          <span>{t("exportTitle")}</span>
          <span className="real-feature-spacer" />
          <Button size="icon-xs" variant="ghost" aria-label={t("close")}>
            <X />
          </Button>
        </header>
        <div className="real-feature-export-body">
          <div className="real-feature-export-preview">
            <Artwork id="share-your-work" />
            <span>{t("templates:shareYourWork")}</span>
            <small>480 × 480 px</small>
          </div>
          <div className="real-feature-export-fields">
            <div className="real-feature-export-formats">
              <Button size="xs" variant="ghost">
                PNG
              </Button>
              <Button size="xs" variant="secondary">
                MP4
              </Button>
              <Button size="xs" variant="ghost">
                WebM
              </Button>
            </div>
            <div className="real-feature-export-field">
              <Label>{t("exportPanel:resolution")}</Label>
              <SelectField
                label={t("exportPanel:resolution")}
                value="1"
                options={[{ value: "1", label: "1×" }]}
                onValueChange={unchanged}
                prewarm={false}
              />
            </div>
            <div className="real-feature-export-field">
              <Label>{t("exportPanel:frameRate")}</Label>
              <SelectField
                label={t("exportPanel:frameRate")}
                value="30"
                options={[{ value: "30", label: "30 fps" }]}
                onValueChange={unchanged}
                prewarm={false}
              />
            </div>
            <div className="real-feature-setting real-feature-audio">
              <span>
                <Volume2 size={12} />
                {t("exportPanel:includeAudio")}
              </span>
              <Switch
                size="sm"
                checked
                onCheckedChange={unchanged}
                tabIndex={-1}
                aria-label={t("exportPanel:includeAudio")}
              />
            </div>
          </div>
        </div>
        <footer className="real-feature-export-footer">
          <span>MP4 · H.264</span>
          <Button size="xs" variant="outline">
            {t("cancel")}
          </Button>
          <Button size="xs">
            <ArrowDownToLine />
            {t("exportPanel:exportVideo")}
          </Button>
        </footer>
      </div>
    </Interface>
  );
}
