import { useContext, useLayoutEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Throbber } from "../../../components/ui/throbber/Throbber";
import { presentationSpring } from "../../../components/shared/motion/presentation-spring";
import { WorkspaceChromeReadiness } from "./context";
import type { WorkspaceTransitionState } from "./controller";
import "../../../components/projects/workspace-mode/messages";
import "./workspace-transition.css";

/** Place in an actual chrome Suspense fallback, so nested lazy work owns its lifetime. */
export function WorkspaceChromePending() {
  const pending = useContext(WorkspaceChromeReadiness);
  useLayoutEffect(() => pending?.(), [pending]);
  return null;
}

export function WorkspaceTransitionSurface({ state }: { state: WorkspaceTransitionState }) {
  const { t } = useTranslation("workspaceMode");
  const reduced = useReducedMotion();
  return (
    <AnimatePresence>
      {state.phase === "preparing" && (
        <motion.div
          className="workspace-transition-surface canvas-loading-feedback"
          data-workspace-transition-loader
          role="status"
          aria-live="polite"
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reduced ? { duration: 0 } : presentationSpring}
        >
          <Throbber
            size={56}
            state="loading"
            variant="shimmer"
            label={t("switching", { workspace: t(state.target) })}
            decorative
            delayMs={0}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
