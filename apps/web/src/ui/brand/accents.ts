import { brand } from "./config";

/** Curated interface accents. Brand artwork and document colors remain independent. */
export const accentPalettes = {
  violet: { light: brand.colors.action, dark: "#BCA4FF", action: brand.colors.action },
  green: { light: "#087C30", dark: "#0CC147", action: "#06692A" },
  blue: { light: "#1D4ED8", dark: "#77AAFF", action: "#1D4ED8" },
  teal: { light: "#0F766E", dark: "#2DD4BF", action: "#0B655F" },
  rose: { light: "#BE185D", dark: "#FB86B4", action: "#BE185D" },
  amber: { light: "#9A5600", dark: "#FBBF24", action: "#9A5600" },
} as const;
export type Accent = keyof typeof accentPalettes;
export const accentIds = Object.keys(accentPalettes) as Accent[];
export const ACCENT_STORAGE_KEY = "musart.accent.v1";
export function isAccent(value: unknown): value is Accent {
  return typeof value === "string" && Object.hasOwn(accentPalettes, value);
}
export function accentTokens(accent: Accent, dark: boolean): Record<`--${string}`, string> {
  const palette = accentPalettes[accent];
  return {
    "--primary": dark ? palette.dark : palette.light,
    "--primary-foreground": dark ? "#18181B" : "#FFFFFF",
    "--action": palette.action,
    "--action-foreground": "#FFFFFF",
    "--ring": dark ? palette.dark : palette.light,
  };
}
export function paintAccent(root: HTMLElement, accent: Accent) {
  const tokens = accentTokens(accent, root.classList.contains("dark"));
  for (const [key, value] of Object.entries(tokens)) {
    if (root.style.getPropertyValue(key) !== value) root.style.setProperty(key, value);
  }
  if (root.dataset.accent !== accent) root.dataset.accent = accent;
}
// Apply the same validated tokens before hydration to avoid a flash of the default palette.
const bootstrapPalettes = Object.fromEntries(
  accentIds.map((id) => [id, [accentTokens(id, false), accentTokens(id, true)]]),
);
export const accentBootstrapScript = `try{const p=${JSON.stringify(bootstrapPalettes)};const r=document.documentElement;let v;try{v=localStorage.getItem('${ACCENT_STORAGE_KEY}')}catch{}const a=Object.hasOwn(p,v)?v:'violet';const t=p[a][r.classList.contains('dark')?1:0];for(const k in t)r.style.setProperty(k,t[k]);r.dataset.accent=a}catch{}`;
