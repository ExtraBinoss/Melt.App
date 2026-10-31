import { expect, it } from "vitest";
import { Texture } from "three/webgpu";
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
