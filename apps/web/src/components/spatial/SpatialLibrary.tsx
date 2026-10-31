import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Box, Circle, Cylinder, Donut, Pyramid, Pill, Type, Upload } from "lucide-react";
import type { EnginePort } from "@musart/core";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Button } from "../ui/button";
import { IconButton } from "../shared/IconButton";
import { importSpatialModel, insertSpatialObject } from "../../services/assets/spatial-import";
import "./messages";
import "./spatial.css";
const objects = [
  ["box", Box],
  ["sphere", Circle],
  ["torus", Donut],
  ["capsule", Pill],
  ["cone", Pyramid],
  ["cylinder", Cylinder],
] as const;
export function SpatialLibrary({ engine }: { engine: EnginePort }) {
  const { t } = useTranslation("spatial");
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null),
    pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <IconButton label={t("title")}>
          <Box strokeWidth={1.65} />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        className="spatial-library"
        aria-label={t("objects")}
      >
        <div className="spatial-objects">
          {objects.map(([source, Icon]) => (
            <Button
              key={source}
              variant="ghost"
              onClick={() => {
                insertSpatialObject(engine, source, t(`primitives.${source}`));
                setOpen(false);
              }}
            >
              <Icon size={25} strokeWidth={1.4} />
              <span>{t(`primitives.${source}`)}</span>
            </Button>
          ))}
        </div>
        <div className="spatial-library-actions">
          <Button
            variant="outline"
            onClick={() => {
              insertSpatialObject(engine, "text", t("primitives.text"));
              setOpen(false);
            }}
          >
            <Type size={14} />
            {t("primitives.text")}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            aria-busy={busy}
            onClick={() => input.current?.click()}
          >
            <Upload size={14} />
            {t(busy ? "importing" : "importModel")}
          </Button>
        </div>
        <input
          ref={input}
          hidden
          type="file"
          accept=".glb,model/gltf-binary"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            pending.current?.abort();
            const request = new AbortController();
            pending.current = request;
            setBusy(true);
            setError("");
            void importSpatialModel(engine, file, request.signal)
              .then(() => {
                if (!request.signal.aborted) setOpen(false);
              })
              .catch(() => {
                if (!request.signal.aborted) setError(t("errors.import"));
              })
              .finally(() => {
                if (!request.signal.aborted) setBusy(false);
              });
          }}
        />
        {error && (
          <p role="status" className="spatial-import-error">
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
