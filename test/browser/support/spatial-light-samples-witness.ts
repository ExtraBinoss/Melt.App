import {
  Color,
  Mesh,
  MeshLambertNodeMaterial,
  NoToneMapping,
  OrthographicCamera,
  PlaneGeometry,
  PointLight,
  Scene,
  SpotLight,
  WebGPURenderer,
} from "three/webgpu";
import {
  createSampledLight,
  registerSampledLights,
} from "../../../packages/render/src/spatial/scene/SampledLights";

/** Every color/intensity sequence renders synchronously in one JS task after compilation. */
export async function captureLightSamples(forceWebGL: boolean) {
  const renderer = new WebGPURenderer({ forceWebGL, antialias: false, alpha: false });
  const geometry = new PlaneGeometry(2, 2),
    material = new MeshLambertNodeMaterial({ color: 0xffffff });
  const scene = new Scene(),
    camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 3;
  scene.background = new Color(0);
  scene.add(new Mesh(geometry, material));
  renderer.toneMapping = NoToneMapping;
  const results = [];
  try {
    await renderer.init();
    registerSampledLights(renderer);
    renderer.setSize(64, 64);
    for (const type of ["directional", "point", "spot"] as const) {
      const light = createSampledLight(type);
      light.position.set(0, 0, 2);
      if (!(light instanceof PointLight)) scene.add(light.target);
      if (light instanceof SpotLight) {
        light.angle = Math.PI / 3;
        light.penumbra = 0;
      }
      scene.add(light);
      try {
        await renderer.compileAsync(scene, camera);
        const images: string[] = [];
        // No await, timer or RAF boundary separates these exact samples. The same
        // native scene, light, material and renderer supply every image.
        for (const [color, gain] of [
          ["#ff0000", 1],
          ["#0000ff", 1],
          ["#0000ff", 0.1],
        ] as const) {
          light.color.set(color);
          light.intensity = gain * (type === "directional" ? 1 : 4);
          renderer.render(scene, camera);
          images.push(renderer.domElement.toDataURL("image/png"));
        }
        results.push({ type, images });
      } finally {
        scene.remove(light);
        if (!(light instanceof PointLight)) scene.remove(light.target);
        light.dispose();
      }
    }
    return { forceWebGL, results };
  } finally {
    scene.clear();
    geometry.dispose();
    material.dispose();
    await renderer.dispose();
  }
}
