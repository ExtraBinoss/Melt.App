import { expect, test, vi } from "vitest";
import {
  Color,
  DirectionalLight,
  PointLight,
  SpotLight,
  NodeFrame,
  NodeUpdateType,
  StandardNodeLibrary,
  type Light,
  type Node,
  type UniformNode,
  type WebGPURenderer,
} from "three/webgpu";
import { createSampledLight, registerSampledLights } from "../../src/spatial/scene/SampledLights";

const value = (node: Node) => (node as UniformNode<"float", number>).value;

test.each(["directional", "point", "spot"] as const)(
  "%s color/intensity and native shape uniforms update between renders in one NodeFrame",
  (type) => {
    const library = new StandardNodeLibrary();
    registerSampledLights({ library } as WebGPURenderer);
    const factory = createSampledLight;
    const light = factory(type);
    const NodeClass = library.getLightNodeClass(light.constructor as new () => Light)!;
    const node = new NodeClass(light),
      frame = new NodeFrame();
    const color = (node as typeof node & { color: Color }).color;
    try {
      frame.frameId = 1;
      frame.renderId = 1;
      light.color.set("#ff0000");
      light.intensity = 2;
      if (light instanceof PointLight || light instanceof SpotLight) {
        light.distance = 7;
        light.decay = 1;
      }
      if (light instanceof SpotLight) {
        light.angle = 0.4;
        light.penumbra = 0.2;
      }
      frame.updateNode(node);
      expect(node.updateType).toBe(NodeUpdateType.RENDER);
      expect(color.toArray()).toEqual([2, 0, 0]);
      frame.renderId = 2;
      light.color.set("#0000ff");
      light.intensity = 0.25;
      if (light instanceof PointLight || light instanceof SpotLight) {
        light.distance = 11;
        light.decay = 3;
      }
      if (light instanceof SpotLight) {
        light.angle = 0.7;
        light.penumbra = 0.6;
      }
      frame.updateNode(node);
      expect(frame.frameId).toBe(1);
      expect(color.toArray()).toEqual([0, 0, 0.25]);
      if (type !== "directional") {
        const native = node as typeof node & { cutoffDistanceNode: Node; decayExponentNode: Node };
        expect(value(native.cutoffDistanceNode)).toBe(11);
        expect(value(native.decayExponentNode)).toBe(3);
      }
      if (type === "spot") {
        const native = node as typeof node & { coneCosNode: Node; penumbraCosNode: Node };
        expect(value(native.coneCosNode)).toBeCloseTo(Math.cos(0.7));
        expect(value(native.penumbraCosNode)).toBeCloseTo(Math.cos(0.7 * 0.4));
      }
      // Native per-render scheduling still deduplicates updates within a source render.
      light.intensity = 8;
      frame.updateNode(node);
      expect(color.toArray()).toEqual([0, 0, 0.25]);
    } finally {
      node.dispose();
      light.dispose();
    }
  },
);

test("registration is renderer-local, idempotent and preserves standard light classes", () => {
  const library = new StandardNodeLibrary(),
    other = new StandardNodeLibrary();
  const standard = library.getLightNodeClass(DirectionalLight),
    add = vi.spyOn(library, "addLight");
  const first = createSampledLight;
  registerSampledLights({ library } as WebGPURenderer);
  registerSampledLights({ library } as WebGPURenderer);
  expect(add).toHaveBeenCalledTimes(3);
  expect(library.getLightNodeClass(DirectionalLight)).toBe(standard);
  expect(first("directional")).toBeInstanceOf(DirectionalLight);
  expect(first("point")).toBeInstanceOf(PointLight);
  expect(first("spot")).toBeInstanceOf(SpotLight);
  expect(other.getLightNodeClass(first("directional").constructor as new () => Light)).toBeNull();
});

test.each(["directional", "point", "spot"] as const)(
  "%s cloning retains native identity, private shadow ownership and render updates",
  (type) => {
    const light = createSampledLight(type);
    light.color.set("#1257cc");
    light.intensity = 3;
    light.position.set(2, 3, 4);
    if (light instanceof DirectionalLight || light instanceof SpotLight)
      light.target.position.set(1, 0, -1);
    const clone = light.clone();
    const library = new StandardNodeLibrary();
    registerSampledLights({ library } as WebGPURenderer);
    const NodeClass = library.getLightNodeClass(clone.constructor as new () => Light)!;
    const node = new NodeClass(clone);
    const removeListener = vi.spyOn(clone, "removeEventListener");
    try {
      expect(clone.constructor).toBe(light.constructor);
      expect(clone.type).toBe(light.type);
      expect(clone.color.equals(light.color)).toBe(true);
      expect(clone.intensity).toBe(3);
      expect(clone.position.equals(light.position)).toBe(true);
      expect(clone.shadow).not.toBe(light.shadow);
      if (
        (clone instanceof DirectionalLight || clone instanceof SpotLight) &&
        (light instanceof DirectionalLight || light instanceof SpotLight)
      ) {
        expect(clone.target).not.toBe(light.target);
        expect(clone.target.position.equals(light.target.position)).toBe(true);
      }
      expect(node.updateType).toBe(NodeUpdateType.RENDER);
      node.dispose();
      expect(removeListener).toHaveBeenCalledWith("dispose", expect.any(Function));
    } finally {
      node.dispose();
      clone.dispose();
      light.dispose();
    }
  },
);

test("standalone source rigs and captured native-light copies both retain per-render updates and dispose their own lights", async () => {
  const { createLayer, createSpatialLayer, createSpatialScene } = await import("@musart/core");
  const { Group, Light: NativeLight, Scene } = await import("three/webgpu");
  const { SpatialResource } = await import("../../src/spatial/SpatialResource");
  const { CaptureScene } = await import("../../src/spatial/reflections/CaptureScene");
  const settings = createSpatialScene();
  const layer = createLayer("group", { spatial: createSpatialLayer("group") });
  const resource = new SpatialResource(new Group(), [], settings),
    capture = new CaptureScene();
  const library = new StandardNodeLibrary();
  registerSampledLights({ library } as WebGPURenderer);
  const original = new Scene();
  const natives = [new DirectionalLight(), new PointLight(), new SpotLight()];
  original.add(...natives);
  try {
    resource.update(layer, settings, null, 1, 1);
    const rigLights = resource.scene.children.filter((child) => child instanceof NativeLight);
    expect(rigLights).toHaveLength(settings.lights.length);
    for (const light of rigLights) {
      const NodeClass = library.getLightNodeClass(light.constructor as new () => Light)!;
      const node = new NodeClass(light);
      expect(node.updateType).toBe(NodeUpdateType.RENDER);
      node.dispose();
    }
    capture.sync([], original, settings, null);
    const copied = capture.scene.children.filter((child) => child instanceof NativeLight);
    expect(copied).toHaveLength(3);
    const disposed = copied.map((light) => vi.spyOn(light, "dispose"));
    const borrowedDisposed = natives.map((light) => vi.spyOn(light, "dispose"));
    for (const light of copied) {
      const NodeClass = library.getLightNodeClass(light.constructor as new () => Light)!;
      const node = new NodeClass(light);
      expect(node.updateType).toBe(NodeUpdateType.RENDER);
      node.dispose();
    }
    capture.dispose();
    capture.dispose();
    for (const dispose of disposed) expect(dispose).toHaveBeenCalledOnce();
    for (const dispose of borrowedDisposed) expect(dispose).not.toHaveBeenCalled();
  } finally {
    capture.dispose();
    resource.dispose();
    for (const light of natives) light.dispose();
  }
});
