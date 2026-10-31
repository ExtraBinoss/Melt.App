import { NearestFilter, NoColorSpace, RenderTarget, UnsignedByteType } from "three/webgpu";

interface Entry {
  readonly target: RenderTarget;
  readonly bytes: number;
}
interface Plan {
  readonly selected: Entry[];
  readonly evicted: Entry[];
  readonly missing: number;
  readonly bytes: number;
}
const targetBytes = (width: number, height: number) => {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new RangeError("Invalid effect target dimensions.");
  const bytes = width * height * 4;
  if (!Number.isSafeInteger(bytes)) throw new RangeError("Invalid effect target allocation.");
  return bytes;
};
function createTarget(width: number, height: number): RenderTarget {
  const target = new RenderTarget(width, height, {
    depthBuffer: false,
    stencilBuffer: false,
    type: UnsignedByteType,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    generateMipmaps: false,
  });
  target.texture.colorSpace = NoColorSpace;
  target.texture.name = "melt:effect-surface";
  return target;
}

function disposeTarget(target: RenderTarget): void {
  // Compilation can initialize a sampled texture before its framebuffer exists.
  // Release that allocation too; Three removes its listener after the first dispose.
  target.texture.dispose();
  target.dispose();
}

/** Exact-size scratch surfaces. Nothing borrowed here escapes an effect apply call.
 * The idle reuse window is bounded by bytes and count. A larger active working set
 * (at most two surfaces) evicts every idle entry and stays charged to the caller's
 * hard GPU budget. Eviction always precedes allocation, including on failures.
 */
export class EffectTargetPool {
  private entries: Entry[] = [];
  constructor(
    private readonly maxBytes = 32 * 1024 * 1024,
    private readonly maxTargets = 8,
    private readonly create = createTarget,
  ) {
    if (
      !Number.isSafeInteger(maxBytes) ||
      maxBytes < 1 ||
      !Number.isInteger(maxTargets) ||
      maxTargets < 2
    )
      throw new RangeError("Invalid effect target pool limits.");
  }
  get bytes(): number {
    return this.entries.reduce((sum, entry) => sum + entry.bytes, 0);
  }
  get targets(): number {
    return this.entries.length;
  }
  private plan(width: number, height: number, count: number): Plan {
    const bytes = targetBytes(width, height);
    if (!Number.isInteger(count) || count < 0 || count > 2)
      throw new RangeError("Invalid effect target working set.");
    const selected = this.entries
      .filter(({ target }) => target.width === width && target.height === height)
      .slice(0, count);
    const missing = count - selected.length;
    let projected = this.bytes + missing * bytes;
    let targets = this.targets + missing;
    const evicted: Entry[] = [];
    for (const entry of this.entries) {
      if (projected <= this.maxBytes && targets <= this.maxTargets) break;
      if (selected.includes(entry)) continue;
      evicted.push(entry);
      projected -= entry.bytes;
      targets--;
    }
    return { selected, evicted, missing, bytes: projected };
  }
  /** Includes the current allocation until acquire has actually evicted it. */
  projectedBytes(width: number, height: number, count: number): number {
    return Math.max(this.bytes, this.plan(width, height, count).bytes);
  }
  acquire(width: number, height: number, count: number): readonly RenderTarget[] {
    const plan = this.plan(width, height, count);
    for (const entry of plan.evicted) {
      this.entries.splice(this.entries.indexOf(entry), 1);
      disposeTarget(entry.target);
    }
    const created: Entry[] = [];
    try {
      for (let index = 0; index < plan.missing; index++) {
        const entry = { target: this.create(width, height), bytes: targetBytes(width, height) };
        created.push(entry);
        this.entries.push(entry);
      }
    } catch (error) {
      for (const entry of created) {
        this.entries.splice(this.entries.indexOf(entry), 1);
        disposeTarget(entry.target);
      }
      throw error;
    }
    const active = [...plan.selected, ...created];
    this.entries = [...this.entries.filter((entry) => !active.includes(entry)), ...active];
    return active.map(({ target }) => target);
  }
  dispose(): void {
    for (const entry of this.entries) disposeTarget(entry.target);
    this.entries = [];
  }
}
