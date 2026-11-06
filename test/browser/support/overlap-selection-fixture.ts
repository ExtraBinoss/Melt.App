import { createLayer, createPage, createProject } from "@musart/core";

/** Distinct source ink, even-odd vector holes, inherited locks and affine hierarchy. */
export function overlapSelectionFixture(dataUrl: string) {
  return createProject({
    id: "overlap-selection-project",
    assets: {
      ink: {
        id: "ink",
        name: "Half transparent",
        mime: "image/png",
        width: 180,
        height: 140,
        dataUrl,
      },
    },
    pages: [
      createPage({
        id: "overlap-page",
        width: 640,
        height: 480,
        layers: [
          createLayer("rectangle", {
            id: "underlay",
            name: "Underlay",
            width: 640,
            height: 480,
            background: false,
            fill: "#f2eadc",
          }),
          createLayer("group", {
            id: "affine-group",
            name: "Affine group",
            x: 45,
            y: 45,
            width: 220,
            height: 190,
            rotation: 15,
            affine: [1, 0.12, 0.15, 1],
          }),
          createLayer("image", {
            id: "source-ink",
            name: "Source ink",
            parentId: "affine-group",
            assetId: "ink",
            x: 10,
            y: 10,
            width: 180,
            height: 140,
          }),
          createLayer("vector", {
            id: "donut",
            name: "Vector donut",
            x: 360,
            y: 40,
            width: 160,
            height: 160,
            fill: "#d86a46",
            vector: {
              viewBox: "0 0 160 160",
              parts: [{ path: "M0 0h160v160H0z M40 40h80v80H40z", fillRule: "evenodd" }],
            },
          }),
          createLayer("rectangle", {
            id: "covered",
            name: "Covered rectangle",
            x: 100,
            y: 285,
            width: 180,
            height: 140,
            fill: "#d9b962",
          }),
          createLayer("rectangle", {
            id: "cover",
            name: "Opaque cover",
            x: 100,
            y: 285,
            width: 180,
            height: 140,
            fill: "#17404c",
          }),
          createLayer("group", {
            id: "locked-group",
            name: "Locked group",
            x: 360,
            y: 245,
            width: 160,
            height: 160,
            locked: true,
          }),
          createLayer("rectangle", {
            id: "locked-child",
            name: "Locked child",
            parentId: "locked-group",
            width: 160,
            height: 160,
            fill: "#395eb2",
          }),
        ],
      }),
    ],
  });
}
