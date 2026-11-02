import { validateProject, type Project } from "@musart/core";
/** Archive originals keep their durable asset IDs; only document identities change. */
export function remapPortableProject(project: Project, id: string): Project {
  const replay = project.replay;
  const result = {
    ...project,
    id,
    ...(replay
      ? {
          replay: {
            ...replay,
            initial: { ...replay.initial, id },
            events: replay.events.map((event) => ({
              ...event,
              projectId: id,
              ...(event.after ? { after: { ...event.after, id } } : {}),
              delta: event.delta.map((delta) =>
                delta.op === "set" && delta.path.length === 1 && delta.path[0] === "id"
                  ? { ...delta, value: id }
                  : delta,
              ),
            })),
          },
        }
      : {}),
  };
  validateProject(result);
  return result;
}
