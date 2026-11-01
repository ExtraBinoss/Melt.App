import { useTranslation } from "react-i18next";
import type { EditorServices, ProjectSummary } from "../../../state/contracts";
import { TEMPLATE_CATALOG } from "../../../services/projects/templates/catalog";
import { SearchInput } from "../../assets/SearchInput";
import { SocialBrandIcon } from "../../assets/SocialBrandIcon";
import { MeltMark } from "../../../ui/brand/MeltMark";
import { LibraryModeFilter } from "./LibraryModeFilter";
import { projectLibraryMode, type LibraryMode } from "./library-mode";
import { ProjectSearchPreview } from "../gallery/ProjectSearchPreview";
import "./messages";
import "../templates/messages";

/** One retained search field; changing the library section never fades or replaces it. */
export function LibraryToolbar({
  view,
  query,
  onQueryChange,
  mode,
  onModeChange,
  projects,
  services,
  disabled,
}: {
  view: "projects" | "templates";
  query: string;
  onQueryChange: (query: string) => void;
  mode: LibraryMode;
  onModeChange: (mode: LibraryMode) => void;
  projects: readonly ProjectSummary[];
  services: EditorServices;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const hints =
    view === "projects"
      ? projects
          .filter((project) => mode === "all" || projectLibraryMode(project) === mode)
          .slice(0, 6)
          .map((project) => ({
            label: project.name,
            preview: <ProjectSearchPreview project={project} services={services} />,
          }))
      : TEMPLATE_CATALOG.filter((item) => mode === "all" || item.mode === mode)
          .slice(0, 6)
          .map((item) => ({
            label: t(item.nameKey),
            preview: item.preview ? (
              <img src={item.preview} alt="" />
            ) : (
              <SocialBrandIcon id={item.brandId ?? ""} size={20} />
            ),
          }));
  return (
    <div className="library-toolbar">
      <div className="library-search">
        <SearchInput
          aria-label={t(view === "projects" ? "dashboard:searchProjects" : "templates:search")}
          prefix={t("common.search")}
          hints={
            hints.length
              ? hints
              : [{ label: t("dashboard:projects"), preview: <MeltMark size={20} /> }]
          }
          value={query}
          disabled={disabled}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>
      <div className="library-mode-toggle">
        <LibraryModeFilter value={mode} onChange={onModeChange} disabled={disabled} />
      </div>
    </div>
  );
}
