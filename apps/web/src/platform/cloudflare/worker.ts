import type { ResponseInit as WorkersResponseInit } from "@cloudflare/workers-types";

/** Matched static assets bypass this leaf; only oversized WASM needs encoded transport. */
export default {
  async fetch(request: Request, env: Cloudflare.Env) {
    const headers = Object.fromEntries(request.headers);
    const asset = await env.ASSETS.fetch(request.url, { method: request.method, headers });
    const url = new URL(request.url);
    if (asset.status !== 404 || !/^\/assets\/[\w.-]+\.wasm$/.test(url.pathname)) return asset;
    if (request.method !== "GET" && request.method !== "HEAD") return asset;
    // Encoded ranges cannot be decoded independently. HTTP permits a full 200 response.
    delete headers.range;
    delete headers["if-range"];
    url.pathname += ".gz";
    const packed = await env.ASSETS.fetch(url.href, { method: request.method, headers });
    if (packed.status !== 200 && packed.status !== 304) return asset;
    const responseHeaders = new Headers([...packed.headers]);
    responseHeaders.set("Content-Type", "application/wasm");
    responseHeaders.set("Content-Encoding", "gzip");
    responseHeaders.delete("Accept-Ranges");
    responseHeaders.delete("Content-Length");
    const options = {
      status: packed.status,
      headers: Object.fromEntries(responseHeaders),
      encodeBody: "manual" as const,
    } satisfies WorkersResponseInit;
    // Both platforms describe the same Web Stream with different ambient extensions.
    const body = packed.body as ReadableStream<Uint8Array> | null;
    return new Response(request.method === "HEAD" || packed.status === 304 ? null : body, options);
  },
};
