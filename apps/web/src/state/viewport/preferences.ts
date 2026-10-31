import {
  atomWithStorage,
  createJSONStorage,
  unstable_withStorageValidator as withStorageValidator,
} from "jotai/utils";
export const ZOOM_CONTROLS_STORAGE_KEY = "musart.canvas-zoom-controls.v1";
const storage = withStorageValidator((value): value is boolean => typeof value === "boolean")(
  createJSONStorage(() => localStorage),
);
/** Device-local presentation only. Wheel, touch and keyboard navigation stay available. */
export const zoomControlsAtom = atomWithStorage(ZOOM_CONTROLS_STORAGE_KEY, false, storage);
