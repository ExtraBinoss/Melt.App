import { Activity, Component, createRef, useLayoutEffect, useState, type ReactNode } from "react";
import type { CommandCommitInfo, EnginePort } from "@musart/core";

/** Loads are new owners even when portable IDs and authored paint are identical. */
export function usePaintOwner(engine: EnginePort, pageId: string): string {
  const [load, setLoad] = useState({ engine, epoch: 0 });
  if (load.engine !== engine) setLoad({ engine, epoch: load.epoch + 1 });
  useLayoutEffect(() => {
    const commits = engine as EnginePort & {
      subscribeCommitInfo?: (listener: (info: CommandCommitInfo) => void) => () => void;
    };
    return commits.subscribeCommitInfo?.((info) => {
      if (info.kind === "load") setLoad((current) => ({ engine, epoch: current.epoch + 1 }));
    });
  }, [engine]);
  return `${load.epoch}:${engine.getSnapshot().project.id}:${pageId}`;
}

interface RetainedPaintProps {
  visible: boolean;
  retain?: boolean;
  children: ReactNode;
}

/** One visited owner only. Hidden effects stop; active drafts and portals are never cached. */
export class RetainedPaint extends Component<RetainedPaintProps, { visited: boolean }, boolean> {
  state = { visited: this.props.visible };
  private readonly scope = createRef<HTMLDivElement>();

  static getDerivedStateFromProps(props: RetainedPaintProps, state: { visited: boolean }) {
    return props.visible && !state.visited ? { visited: true } : null;
  }

  getSnapshotBeforeUpdate(previous: RetainedPaintProps): boolean {
    const scope = this.scope.current;
    if (this.props.retain === false || !previous.visible || this.props.visible || !scope)
      return false;
    if (
      scope.contains(scope.ownerDocument.activeElement) ||
      scope.querySelector(':active,[aria-busy="true"],[data-state="open"],[data-state$="-open"]')
    )
      return true;
    return Array.from(scope.querySelectorAll("[aria-controls],[aria-describedby]")).some((node) =>
      `${node.getAttribute("aria-controls") ?? ""} ${node.getAttribute("aria-describedby") ?? ""}`
        .trim()
        .split(/\s+/)
        .some((id) => {
          const portal = scope.ownerDocument.getElementById(id);
          return portal && !scope.contains(portal);
        }),
    );
  }

  componentDidUpdate(_props: RetainedPaintProps, _state: { visited: boolean }, unsafe: boolean) {
    if (unsafe && this.state.visited) this.setState({ visited: false });
  }

  render() {
    if (this.props.retain === false) return this.props.visible ? this.props.children : null;
    if (!this.state.visited) return null;
    return (
      <Activity mode={this.props.visible ? "visible" : "hidden"}>
        <div ref={this.scope} style={{ display: "contents" }}>
          {this.props.children}
        </div>
      </Activity>
    );
  }
}
