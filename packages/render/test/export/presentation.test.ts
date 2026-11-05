import { expect, it } from "vitest";
import { Texture, type Vector2 } from "three/webgpu";
import { GpuPresentation } from "../../src/export/presentation";
import { makeGpuRenderer } from "../gpu-fixture";
it("presents the final premultiplied texture directly to the browser framebuffer", () => {
  const { renderer, fake } = makeGpuRenderer();
  const presentation = new GpuPresentation(renderer);
  presentation.render({ texture: new Texture(), width: 300, height: 200, premultiplied: true });
  expect(fake.setSize).toHaveBeenCalledWith(300, 200, false);
  expect(fake.setRenderTarget).toHaveBeenLastCalledWith(null);
  expect(fake.render).toHaveBeenCalledOnce();
  expect(fake.readRenderTargetPixelsAsync).not.toHaveBeenCalled();
  presentation.dispose();
});

it("keeps the browser framebuffer intact between same-size playback frames", () => {
  const { renderer, fake } = makeGpuRenderer();
  const presentation = new GpuPresentation(renderer);
  const frame = { texture: new Texture(), width: 480, height: 270, premultiplied: true };
  for (let index = 0; index < 90; index++) presentation.render(frame);
  expect(fake.setSize).toHaveBeenCalledTimes(1);
  expect(fake.render).toHaveBeenCalledTimes(90);
  presentation.render({ ...frame, width: 960, height: 540 });
  expect(fake.setSize).toHaveBeenCalledTimes(2);
  presentation.dispose();
});

it("maps a final GPU texture crop and resets its uniforms for subsequent full frames", () => {
  const { renderer, fake } = makeGpuRenderer();
  const presentation = new GpuPresentation(renderer);
  const uniforms = presentation as unknown as {
    offset: { value: Vector2 };
    extent: { value: Vector2 };
  };
  const frame = { texture: new Texture(), width: 800, height: 600, premultiplied: true };
  presentation.render(frame, {
    width: 200,
    height: 400,
    source: { width: 800, height: 600 },
    region: { x: 300, y: 100, width: 200, height: 400 },
  });
  expect(fake.setSize).toHaveBeenLastCalledWith(200, 400, false);
  expect(uniforms.offset.value.toArray()).toEqual([300 / 800, 100 / 600]);
  expect(uniforms.extent.value.toArray()).toEqual([200 / 800, 400 / 600]);
  presentation.render(frame);
  expect(uniforms.offset.value.toArray()).toEqual([0, 0]);
  expect(uniforms.extent.value.toArray()).toEqual([1, 1]);
  expect(fake.setSize).toHaveBeenLastCalledWith(800, 600, false);
  expect(fake.readRenderTargetPixelsAsync).not.toHaveBeenCalled();
  presentation.dispose();
});
