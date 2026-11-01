import type { Composition, Layer } from "@musart/core";

type Dependency = string | number | boolean | null | undefined;
type Emit = (value: Dependency) => void;
/** The issuing adapter owns immutable page/layer/nested render data for this
 * frame's entire lifetime. Portable external drafts do not imply this contract.
 */
export interface ImmutableSourceFrame {
  readonly page: Composition;
}
interface Entry {
  layer: WeakRef<Layer>;
  dependencies: Dependency[];
  key: string;
  bytes: number;
}
// Must match the fields omitted by keys.ts. Everything else contributes source pixels.
const placement = new Set([
  "id",
  "name",
  "x",
  "y",
  "rotation",
  "scaleX",
  "scaleY",
  "affine",
  "opacity",
  "visible",
  "locked",
  "margin",
  "padding",
  "guides",
  "parentId",
  "blendMode",
]);
function sameSource(before: Layer | undefined, after: Layer): boolean {
  if (before === after) return true;
  if (!before) return false;
  let count = 0;
  for (const field of Object.keys(before) as (keyof Layer)[]) {
    if (placement.has(field)) continue;
    count++;
    if (!Object.hasOwn(after, field) || !Object.is(before[field], after[field])) return false;
  }
  for (const field of Object.keys(after)) if (!placement.has(field)) count--;
  return count === 0;
}

/** Retained dependency comparison for certified immutable layers only.
 * Stores scalar dependencies and weak layer references, never documents or original assets.
 * A miss still uses the canonical full signature; eviction cannot create a false hit.
 */
export class SourceKeyCache {
  private readonly entries = new Map<string, Entry>();
  private identities = new WeakMap<object, number>();
  private sequence = 0;
  private bytes = 0;
  private hits = 0;
  private misses = 0;
  private vectors = 0;
  private bypassedJobs = 0;
  private readonly recent = new Map<number, WeakRef<Composition>>();
  constructor(
    private readonly maxEntries = 32768,
    private readonly maxBytes = 16 * 1024 * 1024,
  ) {
    if (![maxEntries, maxBytes].every((value) => Number.isSafeInteger(value) && value > 0))
      throw new RangeError("Invalid source dependency budget.");
  }
  identity(value: object | null | undefined): number {
    if (!value) return 0;
    let identity = this.identities.get(value);
    if (identity === undefined) this.identities.set(value, (identity = ++this.sequence));
    return identity;
  }
  address(page: Composition, layer: Layer, scale: number): string {
    return `${page.id.length}:${page.id}${layer.id.length}:${layer.id}:${scale}`;
  }
  /** Structural commands can clone every source descriptor. Sample at most eight
   * existing representatives before paying dependency comparison for the entire job.
   * A repeated identical page is always admitted so a new stable scene can warm up.
   */
  accepts(page: Composition, scale: number): boolean {
    if (this.recent.get(scale)?.deref() === page) return true;
    this.recent.delete(scale);
    this.recent.set(scale, new WeakRef(page));
    if (this.recent.size > 16) this.recent.delete(this.recent.keys().next().value!);
    let known = 0;
    const stride = Math.max(1, Math.floor(page.layers.length / 8));
    for (let index = 0; index < page.layers.length && known < 8; index += stride) {
      const layer = page.layers[index]!;
      const previous = this.entries.get(this.address(page, layer, scale));
      if (!previous) continue;
      known++;
      if (sameSource(previous.layer.deref(), layer)) return true;
    }
    if (known < 4) return true;
    this.bypassedJobs++;
    return false;
  }
  resolve(id: string, layer: Layer, visit: (emit: Emit) => void, build: () => string): string {
    const previous = this.entries.get(id);
    let next: Dependency[] | undefined;
    let at = 0;
    const previousLayer = previous?.layer.deref();
    let equal = !!previous && sameSource(previousLayer, layer);
    visit((value) => {
      if (equal && !Object.is(previous!.dependencies[at], value)) equal = false;
      if (!equal && !next) {
        next = previous?.dependencies.slice(0, at) ?? [];
        this.vectors++;
      }
      next?.push(value);
      at++;
    });
    equal &&= at === previous!.dependencies.length;
    if (equal) {
      this.hits++;
      if (previousLayer !== layer) previous!.layer = new WeakRef(layer);
      // Recursive child resolution may have evicted this parent while visit ran.
      if (!this.entries.has(id)) this.bytes += previous!.bytes;
      this.entries.delete(id);
      this.entries.set(id, previous!);
      this.trim();
      return previous!.key;
    }
    this.misses++;
    const key = build();
    // A shorter dependency list may have matched the complete visited prefix.
    const dependencies = next ?? previous?.dependencies.slice(0, at) ?? [];
    if (!next) this.vectors++;
    const bytes =
      (id.length + key.length) * 2 +
      dependencies.reduce<number>(
        (sum, value) => sum + (typeof value === "string" ? value.length * 2 : 8),
        0,
      );
    if (previous && this.entries.get(id) === previous) {
      this.entries.delete(id);
      this.bytes -= previous.bytes;
    }
    if (bytes <= this.maxBytes) {
      this.entries.set(id, { layer: new WeakRef(layer), dependencies, key, bytes });
      this.bytes += bytes;
    }
    this.trim();
    return key;
  }
  private trim(): void {
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
      const [oldest, entry] = this.entries.entries().next().value!;
      this.entries.delete(oldest);
      this.bytes -= entry.bytes;
    }
  }
  clear(): void {
    this.entries.clear();
    this.identities = new WeakMap();
    this.recent.clear();
    this.bytes = 0;
  }
  stats() {
    return {
      entries: this.entries.size,
      retainedPayloadBytes: this.bytes,
      hits: this.hits,
      misses: this.misses,
      dependencyVectors: this.vectors,
      bypassedJobs: this.bypassedJobs,
      maxEntries: this.maxEntries,
      maxPayloadBytes: this.maxBytes,
    };
  }
}
