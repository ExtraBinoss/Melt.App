import { expect, it } from "vitest";
import { createPage, createProject } from "@musart/core";
import {
  exportMotionVideo,
  MotionExportError,
  openMotionAudioSource,
} from "../../../src/export/motion/index";

it("rejects invalid static video duration before acquiring native media resources", async () => {
  await expect(
    exportMotionVideo(createProject({ pages: [createPage({ id: "static" })] }), {
      compositionId: "static",
      staticDuration: { value: 0, rate: 1 },
    }),
  ).rejects.toBeInstanceOf(MotionExportError);
  expect(typeof openMotionAudioSource).toBe("function");
});
