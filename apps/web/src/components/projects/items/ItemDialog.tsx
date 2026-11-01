import { useState } from "react";
import { preloadEditor } from "../../../bootstrap/preload";
import { useAtomValue, type Atom } from "jotai";
import { ArrowUpRight, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EditorServices } from "../../../state/contracts";
import { libraryItemKey, type LibraryItem } from "../../../services/projects/library/favorites";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../../ui/dialog";
import { Button } from "../../ui/button";
import { MeltMark } from "../../../ui/brand/MeltMark";
import { ItemPreview } from "./ItemPreview";
import { useLibraryFavorites } from "./favorites-context";
import { TEMPLATE_CATALOG } from "../../../services/projects/templates/catalog";
import { ContentTags } from "./contents/ContentTags";
import { useItemTags } from "./contents/use-item-tags";
import "../templates/messages";

export interface LibrarySelection {
  item: LibraryItem;
  open: () => void;
  returnFocus: HTMLElement | null;
}
/** Selection and dismissal subscribe at the dialog leaf, leaving the grid/provider untouched. */
export function ItemDialog({
  selection,
  services,
  busy,
}: {
  selection: Atom<LibrarySelection | null>;
  services: EditorServices;
  busy: boolean;
}) {
  const { t } = useTranslation("libraryItem");
  const selected = useAtomValue(selection);
  const template =
    selected?.item.kind === "template"
      ? TEMPLATE_CATALOG.find((entry) => entry.id === selected.item.id)
      : undefined;
  const { tags, failed: contentsFailed } = useItemTags(selected?.item, services);
  const favorites = useLibraryFavorites()!;
  const [dismissed, setDismissed] = useState<LibrarySelection | null>(null);
  const [failed, setFailed] = useState<LibrarySelection | null>(null);
  const open = !!selected && selected !== dismissed;
  const favorite =
    selected &&
    favorites.items.some((item) => libraryItemKey(item) === libraryItemKey(selected.item));
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) setDismissed(selected);
      }}
    >
      {selected && (
        <DialogContent
          className="library-item-dialog"
          showCloseButton={!busy}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (selected.returnFocus?.isConnected)
              selected.returnFocus.focus({ preventScroll: true });
          }}
        >
          <div className="library-item-info">
            <DialogTitle className="library-item-name">
              {template ? t(template.nameKey) : selected.item.name}
            </DialogTitle>
            <span className="library-item-kind">{t(selected.item.kind)}</span>
            <DialogDescription>
              {template
                ? t(template.descriptionKey, {
                    name: t(template.nameKey),
                    width: template.width,
                    height: template.height,
                  })
                : t(selected.item.kind === "project" ? "libraryContents:project" : "template")}
            </DialogDescription>
            {!!tags?.length && (
              <section className="library-item-contents">
                <h3>{t("libraryContents:used")}</h3>
                <ContentTags tags={tags} />
              </section>
            )}
            {contentsFailed && <p role="alert">{t("libraryContents:failed")}</p>}
            <div className="library-item-author">
              <MeltMark
                size={38}
                className={selected.item.kind === "project" ? "library-author-avatar" : ""}
              />
              <span>
                <small>{t("author")}</small>
                <strong>
                  {selected.item.kind === "project" ? `ExtraBinoss · ${t("me")}` : "Melt"}
                </strong>
              </span>
            </div>
            <Button
              className="library-item-primary"
              disabled={busy}
              onPointerEnter={() => {
                void preloadEditor().catch(() => {});
              }}
              onFocus={() => {
                void preloadEditor().catch(() => {});
              }}
              onClick={() => {
                setDismissed(selected);
                selected.open();
              }}
            >
              <ArrowUpRight size={15} />
              <span>{t("open")}</span>
            </Button>
            <Button
              variant="outline"
              disabled={favorites.saving || busy}
              aria-pressed={!!favorite}
              onClick={() => {
                setFailed(null);
                void favorites.toggle(selected.item, !favorite).catch(() => setFailed(selected));
              }}
            >
              <Star size={14} fill={favorite ? "currentColor" : "none"} />
              <span>{t(favorite ? "unfavorite" : "favorite")}</span>
            </Button>
            {failed === selected && <p role="alert">{t("saveFailed")}</p>}
          </div>
          <ItemPreview
            key={libraryItemKey(selected.item)}
            item={selected.item}
            services={services}
            disabled={busy || !open}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}
