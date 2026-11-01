import { createRoot } from "react-dom/client";
import { createProject } from "../../../packages/core/src/index";
import { App } from "../../../apps/web/src/App";
import { createRuntime } from "../../../apps/web/src/services/session/runtime";
import { attachAutomation } from "../../../apps/web/src/services/automation/automation";
import { changeLanguage, readLanguage } from "../../../apps/web/src/state/i18n";

declare global {
  interface Window {
    disposeEditorWitness?: () => Promise<void>;
  }
}

/** Actual editor/services/GPU, with route bootstrap excluded from focused export witnesses. */
export async function mountEditorWitness() {
  await changeLanguage(readLanguage());
  const host = document.createElement("div");
  host.id = "root";
  document.body.append(host);
  const runtime = await createRuntime((error) => console.error("[Editor witness]", error), {
    project: createProject(),
    editor: true,
  });
  const root = createRoot(host),
    detach = attachAutomation(runtime.engine, runtime.services);
  root.render(<App engine={runtime.engine} services={runtime.services} welcome={false} />);
  window.disposeEditorWitness = async () => {
    detach();
    root.unmount();
    host.remove();
    await runtime.dispose();
    delete window.disposeEditorWitness;
  };
}
