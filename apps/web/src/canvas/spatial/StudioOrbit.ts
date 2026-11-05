import { OrthographicCamera, type PerspectiveCamera } from "three/webgpu";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { OrbitMomentum, type OrbitAngles } from "./orbit-momentum";

interface Callbacks {
  begin(): void;
  preview(): void;
  commit(): void;
  cancel(): void;
  current(): boolean;
  reducedMotion(): boolean;
}
export interface OrbitClock {
  now(): number;
  request(callback: (time: number) => void): number;
  cancel(id: number): void;
}
const clock: OrbitClock = {
  now: () => performance.now(),
  request: (callback) => requestAnimationFrame(callback),
  cancel: (id) => cancelAnimationFrame(id),
};

/** Three owns pointer orbit. The bounded tail previews the same camera until one final commit. */
export class StudioOrbit {
  private controls: OrbitControls;
  private readonly momentum = new OrbitMomentum();
  private phase: "idle" | "drag" | "coast" | "zoom" = "idle";
  private frame: number | null = null;
  private integrating = false;
  private readonly touchAction: string;
  private readonly cursor: string;
  private zoomTarget = 0;
  private zoomTime = 0;
  private lastWheel = 0;
  private zoomHeld = false;
  constructor(
    private readonly camera: PerspectiveCamera | OrthographicCamera,
    private readonly surface: HTMLElement,
    private readonly callbacks: Callbacks,
    private readonly timing: OrbitClock = clock,
  ) {
    this.touchAction = surface.style.touchAction;
    this.cursor = surface.style.cursor;
    this.controls = this.createControls();
  }
  get state() {
    return this.phase;
  }
  get enabled() {
    return this.controls.enabled;
  }
  set enabled(value: boolean) {
    this.controls.enabled = value;
  }
  get coasting() {
    return this.phase === "coast" || this.phase === "zoom";
  }
  beginZoom() {
    this.finish();
    this.callbacks.begin();
    this.phase = "zoom";
    this.zoomHeld = true;
    this.zoomTarget = Math.log(this.distance());
    this.zoomTime = this.lastWheel = this.timing.now();
  }
  endZoom() {
    this.zoomHeld = false;
    if (this.phase === "zoom" && this.frame === null) this.frame = this.timing.request(this.tick);
  }
  zoomBy(factor: number) {
    this.retargetZoom(factor, false);
  }
  zoomWheel(factor: number) {
    this.retargetZoom(factor, true);
  }
  private retargetZoom(factor: number, wheel: boolean) {
    if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return;
    const now = this.timing.now();
    if (this.phase !== "zoom") {
      this.finish();
      this.callbacks.begin();
      this.phase = "zoom";
      this.zoomTarget = Math.log(this.distance());
      this.zoomTime = now;
    }
    const current = Math.log(this.distance());
    // A wheel burst follows the last visible pose. Reversing discards its old
    // target immediately; absolute pinch ratios retain their complete travel.
    const base =
      wheel && Math.sign(-Math.log(factor)) !== Math.sign(this.zoomTarget - current)
        ? current
        : this.zoomTarget;
    let next = base - Math.log(factor);
    if (wheel && !this.callbacks.reducedMotion()) {
      const ahead = Math.log(1.18);
      next = Math.max(current - ahead, Math.min(current + ahead, next));
    }
    this.zoomTarget = Math.max(Math.log(0.2), Math.min(Math.log(100), next));
    this.lastWheel = now;
    if (this.callbacks.reducedMotion()) this.setDistance(Math.exp(this.zoomTarget));
    if (this.frame === null) this.frame = this.timing.request(this.tick);
  }
  private distance() {
    return this.camera.position.length() / this.camera.zoom;
  }
  private setDistance(distance: number) {
    this.integrating = true;
    try {
      if (this.camera instanceof OrthographicCamera) {
        this.camera.zoom = this.camera.position.length() / distance;
        this.camera.updateProjectionMatrix();
      } else this.camera.position.setLength(distance);
      this.controls.update();
    } finally {
      this.integrating = false;
    }
    this.callbacks.preview();
  }
  private pose(): OrbitAngles {
    const p = this.camera.position;
    return { yaw: Math.atan2(p.x, p.z), pitch: Math.asin(p.y / p.length()) };
  }
  private createControls() {
    const controls = new OrbitControls(this.camera, this.surface);
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.minDistance = 0.2;
    controls.maxDistance = 100;
    controls.minPolarAngle = 0.002;
    controls.maxPolarAngle = Math.PI - 0.002;
    controls.enabled = false;
    controls.addEventListener("start", this.start);
    controls.addEventListener("change", this.change);
    controls.addEventListener("end", this.end);
    return controls;
  }
  private start = () => {
    this.finish();
    this.callbacks.begin();
    this.phase = "drag";
    this.momentum.begin(this.pose(), this.timing.now());
  };
  private change = () => {
    if (this.integrating || this.phase !== "drag") return;
    if (!this.callbacks.current()) return this.cancel();
    this.momentum.sample(this.pose(), this.timing.now());
    if (this.frame === null) this.frame = this.timing.request(this.previewDrag);
  };
  private previewDrag = () => {
    this.frame = null;
    if (this.phase !== "drag") return;
    if (!this.callbacks.current()) return this.cancel();
    this.callbacks.preview();
  };
  private end = () => {
    if (this.phase !== "drag") return;
    if (!this.callbacks.current()) return this.cancel();
    if (this.frame !== null) this.timing.cancel(this.frame);
    this.frame = null;
    // Pointer release must include the last native pose even before its RAF.
    this.callbacks.preview();
    if (this.callbacks.reducedMotion() || !this.momentum.release(this.timing.now()))
      return this.finish();
    this.phase = "coast";
    this.frame = this.timing.request(this.tick);
  };
  private tick = (time: number) => {
    this.frame = null;
    if (this.phase === "zoom") {
      if (!this.callbacks.current()) return this.cancel();
      const dt = Math.max(0, time - this.zoomTime) / 1000;
      this.zoomTime = time;
      const current = Math.log(this.distance()),
        remaining = this.zoomTarget - current;
      const settled = Math.abs(remaining) < 0.00025 || this.callbacks.reducedMotion();
      if (Math.abs(remaining) > 1e-9)
        this.setDistance(
          Math.exp(settled ? this.zoomTarget : current + remaining * (1 - Math.exp(-dt / 0.018))),
        );
      if (settled && this.zoomHeld) return;
      if (settled && time - this.lastWheel >= 110) this.finish();
      else this.frame = this.timing.request(this.tick);
      return;
    }
    if (this.phase !== "coast") return;
    if (!this.callbacks.current()) return this.cancel();
    if (this.callbacks.reducedMotion()) return this.finish();
    const delta = this.momentum.step(time);
    this.integrating = true;
    try {
      this.controls.rotateLeft(-delta.yaw);
      this.controls.rotateUp(delta.pitch);
    } finally {
      this.integrating = false;
    }
    this.callbacks.preview();
    if (this.momentum.moving) this.frame = this.timing.request(this.tick);
    else this.finish();
  };
  private stop() {
    if (this.frame !== null) this.timing.cancel(this.frame);
    this.frame = null;
    this.phase = "idle";
    this.zoomHeld = false;
    this.momentum.stop();
  }
  finish() {
    const active = this.phase !== "idle";
    if (this.phase === "drag" && this.frame !== null && this.callbacks.current())
      this.callbacks.preview();
    this.stop();
    if (active) {
      if (this.callbacks.current()) this.callbacks.commit();
      else this.callbacks.cancel();
    }
  }
  invalidate() {
    if (this.phase !== "idle" && !this.callbacks.current()) this.cancel();
  }
  cancel() {
    this.stop();
    this.callbacks.cancel();
    // Recreate through the public API: disconnect alone retains Three's cancelled touch IDs.
    this.controls.dispose();
    this.controls = this.createControls();
  }
  dispose() {
    this.stop();
    this.callbacks.cancel();
    this.controls.dispose();
    this.surface.style.touchAction = this.touchAction;
    this.surface.style.cursor = this.cursor;
  }
}
