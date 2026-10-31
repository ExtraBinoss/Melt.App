import { Component, type ReactNode } from "react";
import type { EnginePort } from "@musart/core";
import { type ViewportResizeLease } from "../../canvas/session/viewport-resize";
import { captureDockLayout } from "./layout-reservation";
interface Props {
  engine: EnginePort;
  projectId: string;
  layoutKey: string;
  reserved: boolean;
  children: ReactNode;
}
/** Read the old viewport before React inserts/removes the timeline's reserved slot. */
export class DockViewportReservation extends Component<
  Props,
  Record<string, never>,
  ViewportResizeLease | null
> {
  private host: HTMLElement | null = null;
  private lease: ViewportResizeLease | null = null;
  getSnapshotBeforeUpdate(previous: Props) {
    if (previous.layoutKey === this.props.layoutKey) return null;
    this.lease?.cancel();
    if (previous.projectId !== this.props.projectId) return null;
    if (!previous.reserved && !this.props.reserved) return null;
    this.host = document.querySelector(".musart-app");
    return (this.lease = captureDockLayout(this.props.engine, this.host) ?? null);
  }
  componentDidUpdate(
    _previous: Props,
    _state: Record<string, never>,
    lease: ViewportResizeLease | null,
  ) {
    if (!lease) return;
    lease.apply();
    void lease.finished.then(() => {
      if (this.lease === lease) this.lease = null;
    });
  }
  componentWillUnmount() {
    this.lease?.cancel();
  }
  render() {
    return this.props.children;
  }
}
