import { describe, expect, it, vi } from "vitest";
import { NearestFilter, NoColorSpace, RenderTarget, UnsignedByteType } from "three/webgpu";
import { EffectTargetPool } from "../../../src/effects/shared/target-pool";

describe("bounded exact-size effect surfaces", () => {
  it("warms two aspect ratios once, preserves format, and charges every retained surface", () => {
    const pool = new EffectTargetPool();
    const wide = pool.acquire(64, 16, 2),
      tall = pool.acquire(16, 64, 2);
    const dispose = [...wide, ...tall].map((target) => vi.spyOn(target, "dispose"));
    const resize = [...wide, ...tall].map((target) => vi.spyOn(target, "setSize"));
    const textures = [...wide, ...tall].map((target) => vi.spyOn(target.texture, "dispose"));
    for (let index = 0; index < 30; index++) {
      expect(pool.acquire(64, 16, 2)).toEqual(wide);
      expect(pool.acquire(16, 64, 2)).toEqual(tall);
    }
    expect(pool.bytes).toBe(4 * 64 * 16 * 4);
    expect(pool.targets).toBe(4);
    expect(pool.projectedBytes(64, 16, 2)).toBe(pool.bytes);
    for (const target of [...wide, ...tall]) {
      expect(target.depthBuffer).toBe(false);
      expect(target.stencilBuffer).toBe(false);
      expect(target.texture).toMatchObject({
        type: UnsignedByteType,
        colorSpace: NoColorSpace,
        minFilter: NearestFilter,
        magFilter: NearestFilter,
        generateMipmaps: false,
      });
    }
    for (const spy of [...dispose, ...resize]) expect(spy).not.toHaveBeenCalled();
    pool.dispose();
    pool.dispose();
    for (const spy of [...dispose, ...textures]) expect(spy).toHaveBeenCalledOnce();
    expect(pool.bytes).toBe(0);
    expect(pool.targets).toBe(0);
  });
  it("evicts least recently used idle surfaces before allocation, with accurate peak projection", () => {
    const pool = new EffectTargetPool(128, 3);
    const first = pool.acquire(2, 2, 1)[0]!;
    const second = pool.acquire(4, 2, 1)[0]!;
    const firstDispose = vi.spyOn(first, "dispose"),
      secondDispose = vi.spyOn(second, "dispose");
    pool.acquire(2, 2, 1); // first is now the most recently used
    expect(pool.projectedBytes(4, 4, 2)).toBe(128);
    const pair = pool.acquire(4, 4, 2);
    expect(pair[0]).not.toBe(pair[1]);
    expect(secondDispose).toHaveBeenCalledOnce();
    expect(firstDispose).toHaveBeenCalledOnce();
    expect(pool.bytes).toBe(128);
    expect(pool.targets).toBe(2);
    // A shrink must keep the old 128-byte allocation charged until actual eviction.
    expect(pool.projectedBytes(1, 1, 1)).toBe(128);
    pool.acquire(1, 1, 1);
    expect(pool.bytes).toBe(68);
    pool.dispose();
  });
  it("enforces count independently of bytes and never evicts matching active surfaces", () => {
    const pool = new EffectTargetPool(4096, 2);
    const first = pool.acquire(2, 2, 1)[0]!,
      next = pool.acquire(3, 2, 1)[0]!;
    const firstDispose = vi.spyOn(first, "dispose"),
      nextDispose = vi.spyOn(next, "dispose");
    pool.acquire(2, 2, 1);
    const active = pool.acquire(2, 2, 2);
    expect(active[0]).toBe(first);
    expect(active[1]).not.toBe(first);
    expect(nextDispose).toHaveBeenCalledOnce();
    expect(firstDispose).not.toHaveBeenCalled();
    expect(pool.targets).toBe(2);
    pool.dispose();
  });
  it("admits only the oversized active pair, then trims it when no longer needed", () => {
    const pool = new EffectTargetPool(32, 8);
    const idle = pool.acquire(1, 1, 1)[0]!,
      idleDispose = vi.spyOn(idle, "dispose");
    expect(pool.projectedBytes(8, 8, 2)).toBe(512);
    const active = pool.acquire(8, 8, 2);
    expect(idleDispose).toHaveBeenCalledOnce();
    expect(pool.bytes).toBe(512);
    expect(pool.acquire(8, 8, 2)).toEqual(active);
    const dispose = active.map((target) => vi.spyOn(target, "dispose"));
    pool.acquire(1, 1, 0);
    expect(pool.bytes).toBe(0);
    expect(pool.targets).toBe(0);
    for (const spy of dispose) expect(spy).toHaveBeenCalledOnce();
    pool.dispose();
  });
  it("rolls back a partial creation failure without hiding retained bytes or exceeding projection", () => {
    let creations = 0;
    const created: RenderTarget[] = [];
    const create = vi.fn((width: number, height: number) => {
      if (++creations === 3) throw new Error("allocation failed");
      const target = new RenderTarget(width, height);
      created.push(target);
      return target;
    });
    const pool = new EffectTargetPool(128, 8, create);
    const retained = pool.acquire(1, 1, 1)[0]!;
    const dispose = vi.spyOn(RenderTarget.prototype, "dispose");
    try {
      const projection = pool.projectedBytes(2, 2, 2);
      expect(() => pool.acquire(2, 2, 2)).toThrow("allocation failed");
      expect(pool.bytes).toBe(4);
      expect(pool.targets).toBe(1);
      expect(pool.bytes).toBeLessThanOrEqual(projection);
      expect(dispose.mock.instances).toContain(created[1]);
      expect(dispose.mock.instances).not.toContain(retained);
      expect(pool.acquire(1, 1, 1)[0]).toBe(retained);
      expect(pool.acquire(2, 2, 2)).toHaveLength(2);
      expect(pool.bytes).toBe(36);
    } finally {
      pool.dispose();
      dispose.mockRestore();
    }
  });
  it("rejects invalid limits and working sets before creating targets", () => {
    expect(() => new EffectTargetPool(0)).toThrow("limits");
    expect(() => new EffectTargetPool(64, 1)).toThrow("limits");
    const pool = new EffectTargetPool();
    expect(() => pool.acquire(0, 2, 1)).toThrow("dimensions");
    expect(() => pool.projectedBytes(2, 2, 3)).toThrow("working set");
    expect(pool.targets).toBe(0);
  });
});
