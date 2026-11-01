import {
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  type CommandCommitInfo,
  type Layer,
  type HistoryPropertyChange,
} from "../../src/index";
export function fixture(
  layers: Layer[] = [createLayer("rectangle", { id: "item", fill: "#000000" })],
  historyLimit = 100,
) {
  const engine = new EditorEngine(createProject({ pages: [createPage({ id: "page", layers })] }), {
    historyLimit,
  });
  const events: CommandCommitInfo[] = [];
  engine.subscribeCommitInfo((event) => events.push(event));
  const description = () => events.at(-1)!.history!;
  const properties = () =>
    description().changes.filter(
      (change): change is HistoryPropertyChange => change.kind === "property",
    );
  return {
    engine,
    events,
    description,
    properties,
    page: () =>
      engine.getSnapshot().project.pages.find((page) => page.id === engine.getSnapshot().pageId)!,
  };
}
export const scalar = (value: number | string | boolean) => ({ kind: "scalar", value });
export const seconds = (value: number) => ({ value, rate: 1 });
