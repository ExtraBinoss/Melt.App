import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceRoute } from "../routing/WorkspaceRoute";
export const Route = createFileRoute("/_workspace")({ component: WorkspaceRoute });
