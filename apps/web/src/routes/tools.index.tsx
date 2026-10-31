import { createFileRoute } from "@tanstack/react-router";
import { ToolHub } from "../tools/ToolHub";
import { toolHead } from "../tools/seo";
export const Route = createFileRoute("/tools/")({ head: () => toolHead(), component: ToolHub });
