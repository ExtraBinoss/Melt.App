import { expect, it, vi } from "vitest";
import {
  Mesh,
  MeshBasicNodeMaterial,
  OrthographicCamera,
  RenderTarget,
  Scene,
  type WebGPURenderer,
} from "three/webgpu";
import { GpuPassProfile } from "../../../src/canvas/render/gpu-pass-profile";

function fixture() {
  const inspector = { beginRender: vi.fn<WebGPURenderer["inspector"]["beginRender"]>() };
  const backend = { getTimestamp: vi.fn(() => 1), hasTimestampQuery: vi.fn(() => true) };
  const renderer = { inspector, backend } as unknown as WebGPURenderer;
  const profile = new GpuPassProfile(renderer);
  const scene = Object.assign(new Scene(), { name: "melt:effects" });
  const mesh = new Mesh(undefined, Object.assign(new MeshBasicNodeMaterial(), { name: "blur:x" }));
  scene.add(mesh);
  const target = new RenderTarget(1, 1),
    camera = new OrthographicCamera();
  return {
    profile,
    inspector,
    backend,
    render: (uid: string) => inspector.beginRender(uid, scene, camera, target),
  };
}
it("groups actual shader stages, distinguishes absent samples and preserves a later inspector owner", () => {
  const d = fixture();
  d.profile.open();
  d.render("outside");
  expect(d.profile.take()).toBeNull();
  d.profile.begin();
  d.render("r:1");
  d.render("r:2");
  expect(d.profile.resolve(d.profile.take())).toEqual({ "effects/blur:x": 2 });
  d.profile.begin();
  d.render("missing");
  d.backend.hasTimestampQuery.mockReturnValue(false);
  expect(d.profile.resolve(d.profile.take())).toBeNull();
  expect(d.backend.getTimestamp).toHaveBeenCalledTimes(2);
  const next = vi.fn<WebGPURenderer["inspector"]["beginRender"]>();
  d.inspector.beginRender = next;
  d.profile.close();
  expect(d.inspector.beginRender).toBe(next);
});
it("rejects an overflowing or duplicate UID batch instead of reporting partial totals", () => {
  const d = fixture();
  d.profile.open();
  d.profile.begin();
  for (let i = 0; i < 513; i++) d.render(`r:${i}`);
  expect(d.profile.resolve(d.profile.take())).toBeNull();
  d.profile.begin();
  d.render("r:duplicate");
  d.render("r:duplicate");
  expect(d.profile.resolve(d.profile.take())).toBeNull();
  expect(d.backend.getTimestamp).not.toHaveBeenCalled();
  d.profile.close();
});
