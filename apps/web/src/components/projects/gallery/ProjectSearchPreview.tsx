import { useEffect, useState } from "react";
import type {
  EditorServices,
  ProjectSummary,
  ProjectThumbnailLease,
} from "../../../state/contracts";
import { brand } from "../../../ui/brand/config";

type ThumbnailServices = Pick<
  EditorServices,
  "loadProjectThumbnails" | "subscribeProjectThumbnails"
>;
interface Resource {
  services: ThumbnailServices;
  projectId: string;
  pageId: string;
  lease: ProjectThumbnailLease;
}

/** Search hints borrow one stored image each; they never open or render a project. */
export function ProjectSearchPreview({
  project,
  services,
}: {
  project: ProjectSummary;
  services: ThumbnailServices;
}) {
  const page = project.pages.find((page) => page.mode === "motion") ?? project.pages[0];
  const pageId = page?.id;
  const [version, setVersion] = useState(0);
  const [resource, setResource] = useState<Resource | null>(null);
  const [failedUrl, setFailedUrl] = useState("");
  useEffect(() => () => resource?.lease.release(), [resource]);
  useEffect(
    () =>
      services.subscribeProjectThumbnails((id) => {
        if (id === project.id) setVersion((version) => version + 1);
      }),
    [services, project.id],
  );
  useEffect(() => {
    if (!pageId) return;
    let active = true;
    void services.loadProjectThumbnails(project.id, [pageId], { allowStale: true }).then(
      (lease) => {
        if (active) setResource({ services, projectId: project.id, pageId, lease });
        else lease.release();
      },
      () => {
        if (active) setResource(null);
      },
    );
    return () => {
      active = false;
    };
  }, [services, project.id, pageId, page?.thumbnailRevision, version]);
  const stored =
    resource?.services === services &&
    resource.projectId === project.id &&
    resource.pageId === pageId
      ? resource.lease.items.find((item) => item.pageId === pageId)?.url
      : undefined;
  const fallback = `${import.meta.env.BASE_URL}${brand.assets.icon}`;
  const url = stored ?? project.thumbnail ?? fallback;
  return (
    <img
      src={url === failedUrl ? fallback : url}
      alt=""
      draggable={false}
      data-project-search-preview={project.id}
      onError={() => setFailedUrl(url)}
    />
  );
}
