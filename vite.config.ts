import { defineConfig } from "vite";
import { TOOL_PAGES } from "./apps/web/src/tools/catalog.ts";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { fiberTimerCompatibility } from "./scripts/vite/fiber-timer.ts";
import { templateContentsPlugin } from "./scripts/vite/template-contents.ts";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
const fiberThreeAdapter = fileURLToPath(
  new URL("./apps/web/src/canvas/render/fiber-three.ts", import.meta.url),
);
export default defineConfig({
  base: process.env.MUSART_BASE_PATH ?? "/",
  root: "apps/web",
  plugins: [
    templateContentsPlugin(),
    fiberTimerCompatibility(fiberThreeAdapter),
    tanstackStart({
      start: { entry: "start.ts" },
      client: { entry: "client.tsx" },
      sitemap: { host: "https://melt.plinka.eu" },
      prerender: {
        enabled: true,
        autoStaticPathsDiscovery: false,
        concurrency: 1,
        crawlLinks: false,
        retryCount: 0,
        failOnError: true,
      },
      pages: [
        { path: "/" },
        { path: "/tools" },
        ...TOOL_PAGES.map((tool) => ({ path: `/tools/${tool.slug}` })),
        { path: "/dashboard", sitemap: { exclude: true } },
        { path: "/editor", sitemap: { exclude: true } },
        { path: "/ssr", sitemap: { exclude: true } },
      ],
      router: {
        quoteStyle: "double",
        semicolons: true,
        routeTreeFileHeader: [
          "/* oxlint-disable typescript/no-explicit-any -- TanStack-generated route registration casts. */",
        ],
      },
    }),
    react(),
    tailwindcss(),
  ],
  optimizeDeps: {
    include: ["@huggingface/transformers", "onnxruntime-web/webgpu"],
    rolldownOptions: { plugins: [fiberTimerCompatibility(fiberThreeAdapter)] },
  },
  resolve: { alias: { "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)) } },
  build: {
    outDir: fileURLToPath(new URL(process.env.MUSART_BUILD_DIR ?? "./dist", import.meta.url)),
    emptyOutDir: true,
    sourcemap: true,
    chunkSizeWarningLimit: 1000,
  },
  preview: { port: 6100, strictPort: true },
  server: { port: 6100, strictPort: true, fs: { allow: ["../.."] } },
});
