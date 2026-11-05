export interface OrbitAngles {
  yaw: number;
  pitch: number;
}
const DECAY_SECONDS = 0.12;
const STOP_SPEED = 0.035;
const MAX_SPEED = 4;
const RELEASE_MEMORY_SECONDS = 0.055;
const wrapped = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** Angular velocity in radians/second. Analytic decay has the same travel at 30/60/120 Hz. */
export class OrbitMomentum {
  private previous: { pose: OrbitAngles; time: number } | null = null;
  private velocity: OrbitAngles = { yaw: 0, pitch: 0 };
  private time = 0;
  begin(pose: OrbitAngles, time: number) {
    this.stop();
    this.previous = { pose, time };
  }
  sample(pose: OrbitAngles, time: number) {
    const previous = this.previous;
    if (!previous) return this.begin(pose, time);
    const dt = (time - previous.time) / 1000;
    if (dt < 0.001) return;
    const blend = 1 - Math.exp(-dt / 0.035);
    this.velocity = {
      yaw: this.velocity.yaw * (1 - blend) + (wrapped(pose.yaw - previous.pose.yaw) / dt) * blend,
      pitch: this.velocity.pitch * (1 - blend) + ((pose.pitch - previous.pose.pitch) / dt) * blend,
    };
    this.previous = { pose, time };
  }
  release(time: number) {
    if (!this.previous) return false;
    const age = Math.max(0, time - this.previous.time) / 1000;
    const speed = Math.hypot(this.velocity.yaw, this.velocity.pitch);
    const gain =
      Math.min(1, MAX_SPEED / Math.max(speed, 1e-9)) * Math.exp(-age / RELEASE_MEMORY_SECONDS);
    this.velocity = { yaw: this.velocity.yaw * gain, pitch: this.velocity.pitch * gain };
    this.time = time;
    this.previous = null;
    return this.moving;
  }
  get moving() {
    return Math.hypot(this.velocity.yaw, this.velocity.pitch) > STOP_SPEED;
  }
  step(time: number): OrbitAngles {
    const dt = Math.max(0, time - this.time) / 1000;
    const speed = Math.hypot(this.velocity.yaw, this.velocity.pitch);
    // Stop at a physical velocity threshold, independently of the last frame's duration.
    const duration = Math.min(
      dt,
      speed > STOP_SPEED ? DECAY_SECONDS * Math.log(speed / STOP_SPEED) : 0,
    );
    const decay = Math.exp(-duration / DECAY_SECONDS);
    const travel = DECAY_SECONDS * (1 - decay);
    const delta = { yaw: this.velocity.yaw * travel, pitch: this.velocity.pitch * travel };
    this.velocity = { yaw: this.velocity.yaw * decay, pitch: this.velocity.pitch * decay };
    if (duration < dt || speed <= STOP_SPEED) this.velocity = { yaw: 0, pitch: 0 };
    this.time = time;
    return delta;
  }
  stop() {
    this.previous = null;
    this.velocity = { yaw: 0, pitch: 0 };
    this.time = 0;
  }
}
