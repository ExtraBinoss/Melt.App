import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { findTool } from "../tools/catalog";
import { toolHead } from "../tools/seo";
import { ToolPage } from "../tools/ToolPage";
export const Route = createFileRoute("/tools/$tool")({
  loader: ({ params }) => {
    const tool = findTool(params.tool);
    if (!tool) throw notFound();
    if (tool.slug !== `${tool.style}-converter`)
      throw redirect({
        to: "/tools/$tool",
        params: { tool: `${tool.style}-converter` },
        statusCode: 301,
      });
    return tool;
  },
  head: ({ loaderData }) => toolHead(loaderData),
  component: ToolRoute,
});
function ToolRoute() {
  return <ToolPage tool={Route.useLoaderData()} />;
}
