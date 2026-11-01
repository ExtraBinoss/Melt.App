export const TEXT_PHASES = [
  "font",
  "shaping",
  "contours",
  "atlas",
  "compile",
  "update",
  "draw",
  "correspondence",
  "simplification",
  "packing",
] as const;
export type TextPhase = (typeof TEXT_PHASES)[number];
export interface TextSourceStats {
  cacheHits: number;
  rebuilds: number;
  shapings: number;
  compilations: number;
  draws: number;
  morphUpdates: number;
  glyphs: number;
  morphShapes: number;
  morphStates: number;
  morphSegments: number;
  maxBandCurves: number;
  atlasBytes: number;
  /** Opt-in bounded host elapsed times; shader execution is measured by GPU timestamps. */
  profile: Partial<Record<TextPhase, readonly number[]>> | null;
}
export type TextInventory = Pick<
  TextSourceStats,
  "glyphs" | "morphShapes" | "morphStates" | "morphSegments" | "maxBandCurves" | "atlasBytes"
>;
export class TextDiagnostics {
  enabled = false;
  cacheHits = 0;
  rebuilds = 0;
  shapings = 0;
  compilations = 0;
  draws = 0;
  morphUpdates = 0;
  inventory: TextInventory = {
    glyphs: 0,
    morphShapes: 0,
    morphStates: 0,
    morphSegments: 0,
    maxBandCurves: 0,
    atlasBytes: 0,
  };
  private profile: Partial<Record<TextPhase, number[]>> | null = null;
  start(): number | null {
    return this.enabled ? performance.now() : null;
  }
  end(phase: TextPhase, start: number | null): void {
    if (start === null) return;
    this.sample(phase, performance.now() - start);
  }
  sample(phase: TextPhase, duration: number): void {
    if (!this.enabled) return;
    this.profile ??= {};
    const values = (this.profile[phase] ??= []);
    if (values.length === 256) values.shift();
    values.push(duration);
  }
  stats(): TextSourceStats {
    return {
      cacheHits: this.cacheHits,
      rebuilds: this.rebuilds,
      shapings: this.shapings,
      compilations: this.compilations,
      draws: this.draws,
      morphUpdates: this.morphUpdates,
      ...this.inventory,
      profile: this.profile
        ? Object.fromEntries(Object.entries(this.profile).map(([k, v]) => [k, [...v]]))
        : null,
    };
  }
}
