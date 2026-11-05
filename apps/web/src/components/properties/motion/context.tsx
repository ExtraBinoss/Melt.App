import { createContext, useContext, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import type { SceneMotionPropertyTarget } from "@musart/core";
import type { MotionEditTarget } from "../../../state/session/motion-edit";

export interface MotionFieldEditor {
  begin(this: void, target?: MotionEditTarget): void;
  beginScene?(this: void, target: SceneMotionPropertyTarget): void;
  start?(this: void, target?: MotionEditTarget): void;
}
const MotionEditing = createContext<MotionFieldEditor | null>(null);

export function MotionFieldProvider({
  editor,
  children,
}: {
  editor: MotionFieldEditor;
  children: ReactNode;
}) {
  const committed = useRef(editor);
  useLayoutEffect(() => {
    committed.current = editor;
  }, [editor]);
  // Only synchronous field capture uses this port. Publish the owner at layout commit,
  // without invalidating retained controls for every unrelated document publication.
  const port = useMemo<MotionFieldEditor>(
    () => ({
      begin: (target) => committed.current.begin(target),
      beginScene: (target) => committed.current.beginScene?.(target),
      start: (target) => (committed.current.start ?? committed.current.begin)(target),
    }),
    [],
  );
  return <MotionEditing.Provider value={port}>{children}</MotionEditing.Provider>;
}
export function useMotionFieldEditor() {
  return useContext(MotionEditing);
}
