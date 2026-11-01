import { createLayer } from "@musart/core";
import type { Layer, VectorPart } from "@musart/core";

const icon = "M4 4H28V28H4Z M10 10H22V22H10Z";
const curve = "M0 0C12 -10 30 25 40 8S58 -4 64 18Q50 36 32 26T0 0Z";
const make = (parts: VectorPart[], viewBox = "0 0 256 256") =>
  createLayer("vector", { width: 256, height: 256, vector: { viewBox, parts } });
export const vectorWorkloads: { name: string; layer: Layer }[] = [
  { name: "single icon / nested hole", layer: make([{ path: icon, fillRule: "evenodd" }]) },
  {
    name: "128 imported icon parts / holes and transforms",
    layer: make(
      Array.from({ length: 128 }, (_, i) => ({
        path: icon,
        fillRule: i % 2 ? "evenodd" : "nonzero",
        matrix: [0.45, 0, 0, 0.45, (i % 16) * 16, Math.floor(i / 16) * 32],
      })),
    ),
  },
  {
    name: "32 curved parts / fill and strokes",
    layer: make(
      Array.from({ length: 32 }, (_, i) => ({
        path: curve,
        stroke: "#fff",
        strokeWidth: 1.5,
        linecap: i % 2 ? "round" : "square",
        linejoin: i % 2 ? "miter" : "bevel",
        matrix: [0.7, 0.1, 0.1, 0.7, (i % 4) * 64, Math.floor(i / 4) * 32],
      })),
    ),
  },
  {
    name: "one complex path / 192 authored cubic segments",
    layer: make([
      {
        path: `M0 128${Array.from({ length: 192 }, (_, i) => {
          const x = (i + 1) * (256 / 192);
          return `C${x - 1} ${96 + (i % 5) * 10} ${x - 0.5} ${160 - (i % 7) * 8} ${x} 128`;
        }).join("")}L256 220H0Z`,
        stroke: "white",
        linejoin: "round",
      },
    ]),
  },
];
export const vectorWitness = make([
  { path: "" },
  { path: icon, fillRule: "evenodd", fill: "#ffb52e", matrix: [2, 0.2, 0.3, 2, 8, 5] },
  { path: "none" },
  { path: icon, fillRule: "nonzero", fill: "#43dfe2", matrix: [-2, 0.2, 0.3, 2, 155, 5] },
  { path: curve, fill: "#ee5688", stroke: "#fff", matrix: [2, 0, 0, 2, 20, 90] },
  {
    path: "M170 110L220 120L190 155",
    fill: "none",
    stroke: "#ffb52e",
    strokeWidth: 7,
    linecap: "square",
    linejoin: "bevel",
  },
  {
    path: "M170 170L220 180L190 215",
    fill: "none",
    stroke: "#43dfe2",
    strokeWidth: 7,
    linecap: "butt",
    linejoin: "miter",
  },
  {
    path: "M20 210L70 225L120 210",
    fill: "none",
    stroke: "#ee5688",
    strokeWidth: 7,
    linecap: "round",
    linejoin: "round",
  },
]);
