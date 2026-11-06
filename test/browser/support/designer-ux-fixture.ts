import { createEffect, createLayer, createPage, createProject } from "@musart/core";
/** Poster-shaped integration witness: opaque overlap, source transparency and reusable styling. */
export function designerUxFixture() {
  const original =
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><circle cx="95" cy="150" r="88" fill="#ff6b45"/><circle cx="145" cy="180" r="60" fill="#17404c"/></svg>';
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(original).toString("base64")}`;
  return createProject({
    id: "designer-ux-poster",
    name: "Designer UX · Poster",
    assets: {
      "transparent-art": {
        id: "transparent-art",
        name: "Transparent artwork",
        mime: "image/svg+xml",
        width: 320,
        height: 320,
        dataUrl,
      },
    },
    pages: [
      createPage({
        id: "designer-ux-page",
        name: "Poster A",
        width: 600,
        height: 800,
        background: "#f2eadc",
        layers: [
          createLayer("rectangle", {
            id: "poster-paper",
            name: "Paper · locked",
            x: 0,
            y: 0,
            width: 600,
            height: 800,
            fill: "#f2eadc",
            locked: true,
            background: true,
          }),
          createLayer("rectangle", {
            id: "poster-panel",
            name: "Accent panel",
            x: 45,
            y: 110,
            width: 510,
            height: 250,
            fill: "#17404c",
            effects: [createEffect("grain", { id: "poster-grain", amount: 0.12 })],
          }),
          createLayer("text", {
            id: "poster-title",
            name: "Title",
            x: 65,
            y: 135,
            width: 460,
            height: 170,
            text: "MELT\nIN PRINT",
            fontSize: 76,
            lineHeight: 0.95,
            fill: "#f2eadc",
          }),
          createLayer("rectangle", {
            id: "poster-under",
            name: "Behind transparent art",
            x: 200,
            y: 400,
            width: 260,
            height: 130,
            fill: "#dbba62",
          }),
          createLayer("image", {
            id: "poster-art",
            name: "Transparent art",
            assetId: "transparent-art",
            x: 80,
            y: 350,
            width: 320,
            height: 320,
          }),
          createLayer("rectangle", {
            id: "poster-covered",
            name: "Behind opaque cover",
            x: 360,
            y: 545,
            width: 140,
            height: 90,
            fill: "#dbba62",
          }),
          createLayer("rectangle", {
            id: "poster-cover",
            name: "Opaque cover",
            x: 340,
            y: 525,
            width: 180,
            height: 130,
            fill: "#17404c",
          }),
          createLayer("text", {
            id: "poster-credit",
            name: "Credits",
            x: 45,
            y: 705,
            width: 510,
            height: 40,
            text: "TYPE · COLOUR · TEXTURE / 2026",
            fontSize: 18,
            fill: "#17404c",
          }),
        ],
      }),
    ],
  });
}
