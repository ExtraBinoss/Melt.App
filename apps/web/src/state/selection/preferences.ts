import {
  atomWithStorage,
  createJSONStorage,
  unstable_withStorageValidator as withStorageValidator,
} from "jotai/utils";
export const MARQUEE_CONTAIN_STORAGE_KEY = "musart.marquee-contain.v1";
const storage = withStorageValidator((value): value is boolean => typeof value === "boolean")(
  createJSONStorage(() => localStorage),
);
/** Device-local selection behavior: touching is the default; full enclosure is opt-in. */
export const marqueeContainAtom = atomWithStorage(MARQUEE_CONTAIN_STORAGE_KEY, false, storage, {
  getOnInit: true,
});
