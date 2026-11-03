import { expect, test, vi } from "vitest";
import { gzipSync } from "node:zlib";
import worker from "../../../apps/web/src/platform/cloudflare/worker";

function binding(...responses: Response[]) {
  const fetch = vi.fn();
  responses.forEach((response) => fetch.mockResolvedValueOnce(response));
  const env: Cloudflare.Env = {
    ASSETS: {
      fetch,
      connect: () => {
        throw Error("Raw socket access is not used by asset delivery.");
      },
    },
  };
  return { fetch, env };
}

test("ordinary assets and genuine non-WASM misses retain the asset service response", async () => {
  for (const [path, status] of [
    ["/assets/normal.wasm", 200],
    ["/missing", 404],
  ] as const) {
    const response = new Response("native", { status });
    const f = binding(response);
    expect(await worker.fetch(new Request(`https://melt.plinka.eu${path}`), f.env)).toBe(response);
    expect(f.fetch).toHaveBeenCalledOnce();
  }
});

test("the compressed stream retains its bytes and headers while encoded ranges are ignored", async () => {
  const bytes = gzipSync(Buffer.from("runtime bytes"));
  const f = binding(
    new Response(null, { status: 404 }),
    new Response(bytes, {
      headers: {
        etag: '"encoded"',
        "cache-control": "public, max-age=31536000, immutable",
        "content-type": "application/gzip",
        "accept-ranges": "bytes",
      },
    }),
  );
  const response = await worker.fetch(
    new Request("https://melt.plinka.eu/assets/runtime-1234.wasm?version=1", {
      headers: { range: "bytes=0-31", "if-range": '"encoded"' },
    }),
    f.env,
  );
  expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  expect(response.headers.get("content-type")).toBe("application/wasm");
  expect(response.headers.get("content-encoding")).toBe("gzip");
  expect(response.headers.get("accept-ranges")).toBeNull();
  expect(response.headers.get("etag")).toBe('"encoded"');
  expect(f.fetch).toHaveBeenNthCalledWith(
    2,
    "https://melt.plinka.eu/assets/runtime-1234.wasm.gz?version=1",
    { method: "GET", headers: {} },
  );
});

test.each([200, 304])(
  "HEAD and conditional responses preserve status without creating a body (%i)",
  async (status) => {
    const f = binding(
      new Response(null, { status: 404 }),
      new Response(null, { status, headers: { etag: '"encoded"' } }),
    );
    const response = await worker.fetch(
      new Request("https://melt.plinka.eu/assets/runtime.wasm", {
        method: status === 200 ? "HEAD" : "GET",
      }),
      f.env,
    );
    expect(response.status).toBe(status);
    expect(response.body).toBeNull();
    expect(response.headers.get("content-encoding")).toBe("gzip");
  },
);

test("missing packed assets and non-read methods cannot turn a real error into a successful payload", async () => {
  const missing = new Response(null, { status: 404 });
  const f = binding(missing, new Response(null, { status: 404 }));
  expect(await worker.fetch(new Request("https://melt.plinka.eu/assets/missing.wasm"), f.env)).toBe(
    missing,
  );
  const post = binding(missing);
  expect(
    await worker.fetch(
      new Request("https://melt.plinka.eu/assets/missing.wasm", { method: "POST" }),
      post.env,
    ),
  ).toBe(missing);
  expect(post.fetch).toHaveBeenCalledOnce();
});
