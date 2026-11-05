import type { FillGradient } from "./gradient";
import type { Effect } from "../document/model";
import { ensure } from "../errors";

export const BACKGROUND_CATEGORIES = [
  "plastic",
  "cinematic",
  "social",
  "editorial",
  "atmosphere",
] as const;
export type BackgroundCategory = (typeof BACKGROUND_CATEGORIES)[number];
export interface BackgroundPreset {
  readonly id: string;
  readonly name: string;
  readonly category: BackgroundCategory;
  readonly gradient: FillGradient;
  /** Ordinary, independently editable effects. IDs are assigned at application time. */
  readonly effects: readonly Pick<Effect, "type" | "amount" | "scale" | "settings">[];
}

// Curated palettes, including deliberately asymmetric highlights and deep tonal anchors.
const palettes: Record<BackgroundCategory, readonly (readonly [string, string])[]> = {
  plastic: [
    ["Pearl shell", "f4eee9 d8b8e8 ffffff a59ad2 ead7f3"],
    ["Liquid chrome", "151a25 8896a4 f5f9ff 59667c b9c5cf"],
    ["Rose quartz", "421f40 cf6c9a fff1e4 b34d83 f8b3c3"],
    ["Glacier glass", "122955 409cbf e6ffff 628ed6 c6f5f6"],
    ["Candy lacquer", "4f1066 d74be2 ffe0ed 8d2bae f8a1d5"],
    ["Champagne foil", "4b341e c5a66a fff9df 9d7941 ebd6a1"],
    ["Jade vinyl", "083f3f 4dbb98 e5fff0 248778 a4e7bb"],
    ["Tangerine resin", "7e2515 f18c45 fff1bf ca522b f9bf74"],
    ["Lilac enamel", "292052 9982d7 faf1ff 5e50a0 c5b4ef"],
    ["Opal mint", "d0efde a0b9e5 fffff7 7ac8c0 e5eedb"],
    ["Cobalt glaze", "0d174c 3565dc d6e9ff 253c9a 89adff"],
    ["Copper satin", "432723 a26951 f7d7b1 78422f d99e72"],
    ["Black cherry", "170d26 713753 ebc2cc 3b173b b46a85"],
  ],
  cinematic: [
    ["After hours", "080d24 20265b 853f76 e89878"],
    ["Teal ember", "071f2b 145767 8b8270 f7a15f"],
    ["Golden frame", "17161c 5b4341 b78860 f1cf86"],
    ["Moonlit noir", "080c15 1e2b3b 637c91 c2c8cc"],
    ["Dune dusk", "221b32 7d4e54 c78b65 e9ca97"],
    ["Velvet premiere", "120d22 4b234b 9a4c6f d7a09a"],
    ["Silver screen", "11171b 3e555a 91a9a6 e6e5d6"],
    ["Night drive", "07112f 163968 963e72 f78c94"],
    ["Burnt celluloid", "231b18 704031 bc6d3d eccd84"],
    ["Arctic cinema", "101b31 33506b 82b0bd d4dfdb"],
    ["Red curtain", "180d1c 571f32 a5434c e89d82"],
    ["Desert cyan", "102e35 3c7273 c49c7a f0d7b1"],
    ["Blue hour", "0b1035 323e7e 8276ad d7b6cc"],
  ],
  social: [
    ["Mango punch", "ff5e54 ff9263 ffe28a"],
    ["Electric orchid", "4626ca b248dc ff92bc"],
    ["Ocean club", "0759b7 11b4c9 b2f1ca"],
    ["Peach studio", "eb849c f7b6a0 fce3b2"],
    ["Acid lime", "365a40 a4ce45 eaf5a1"],
    ["Cherry soda", "991d57 ed4674 ffa38b"],
    ["Digital lavender", "575bc9 a19fe9 e2cef4"],
    ["Solar apricot", "e65c39 ffa74f f9e6a0"],
    ["Poolside", "007e98 44c6ba c2efad"],
    ["Hyper pink", "7829a1 df39a6 ffa8c2"],
    ["Cobalt bloom", "202c9b 507de6 b0cbe8"],
    ["Matcha moment", "5b815b a7c89d e8e6b4"],
    ["Sunset story", "6a3db1 d76d9b ffcb9d"],
  ],
  editorial: [
    ["Warm paper", "ded4c4 f2e9dc fbf7ef"],
    ["Sage journal", "82958c b9c5b2 e5e3cf"],
    ["Clay issue", "9b736a c4a199 ebd5c8"],
    ["Ink and linen", "353e48 8d989e dce0dc"],
    ["Lavender press", "9b97b0 c9c4d3 ece6e8"],
    ["Sandstone", "a48d70 d1bfa0 f0e5d0"],
    ["Pistachio print", "87956f c2c9a5 eff0d9"],
    ["Dusty rose", "a47f88 d3b4bb f1dfe1"],
    ["Fog blue", "8199ad b6c8d3 e5eded"],
    ["Charcoal silk", "24272c 52575d 989d9e"],
    ["Coffee table", "5b4940 9e8676 d8c5b1"],
    ["Terracotta page", "9e6351 cb957c edcbb0"],
    ["Bone white", "d3d0c5 e9e6dd fffff6"],
  ],
  atmosphere: [
    ["Aurora mist", "c5f2d1 83c4c3 7473bb 282e62"],
    ["Dream haze", "fff0d4 e5b4cf a79bcc 596b9b"],
    ["Deep cosmos", "d2a2d4 7363a8 283660 0c1834"],
    ["Morning frost", "f5fbe5 b9e3de 7caec5 527995"],
    ["Coral cloud", "fff0d2 f6b7a4 d789a5 977ea8"],
    ["Forest air", "e3efbb a6c8a7 568f8b 284c60"],
    ["Lavender fog", "f9e7ed c5c0e3 8f9ec7 4d668f"],
    ["Solar halo", "fff7bf f8cf7d e89e85 a5669a"],
    ["Polar light", "defef1 91dccf 5887b7 34376f"],
    ["Indigo smoke", "e1cde8 a08bb9 585b8d 272b53"],
    ["Rainfall", "e0e9de a5c2c3 638b9e 34536d"],
    ["Nebula bloom", "ffe2d0 db9cc0 9b70ad 513d80"],
    ["Amber horizon", "fff0ca e5bd93 b38a97 6a6487"],
  ],
};

export const BACKGROUND_PRESETS: readonly BackgroundPreset[] = Object.freeze(
  BACKGROUND_CATEGORIES.flatMap((category) =>
    palettes[category].map(([name, colors], index): BackgroundPreset => {
      const list = colors.split(" ");
      const radial = category === "atmosphere" || (category === "social" && index % 3 === 1);
      const offsets =
        category === "plastic"
          ? [0, 0.32, 0.48, 0.62, 1]
          : list.length === 4
            ? [0, 0.26 + (index % 3) * 0.07, 0.7, 1]
            : [0, 0.42 + (index % 4) * 0.05, 1];
      return Object.freeze<BackgroundPreset>({
        id: `${category}-${name.toLowerCase().replaceAll(" ", "-")}`,
        name,
        category,
        gradient: {
          kind: radial ? "radial" : "linear",
          angle: category === "plastic" ? 100 + index * 7 : 18 + index * 23,
          ...(radial
            ? {
                radialShape: "circle" as const,
                centerX: 0.25 + (index % 4) * 0.16,
                centerY: 0.2 + (index % 3) * 0.17,
                radius: 0.65 + (index % 4) * 0.12,
              }
            : {}),
          stops: list.map((color, at) => ({ offset: offsets[at]!, color: `#${color}` })),
        },
        effects:
          category === "atmosphere"
            ? [
                { type: "grain", amount: 0.045, scale: 1.2 },
                {
                  type: "feather",
                  amount: 0.35,
                  scale: 2,
                  settings: { centerX: 0.5, centerY: 0.5, radius: 0.78, softness: 0.36 },
                },
              ]
            : category === "cinematic" || category === "editorial"
              ? [
                  {
                    type: "grain",
                    amount: category === "cinematic" ? 0.09 : 0.055,
                    scale: 1.1 + (index % 3) * 0.25,
                  },
                ]
              : [],
      });
    }),
  ),
);

export function getBackgroundPreset(id: string): BackgroundPreset {
  const preset = BACKGROUND_PRESETS.find((item) => item.id === id);
  ensure(preset, "INVALID_COMMAND", "Unknown background preset");
  return preset;
}
