import {
  atomWithStorage,
  createJSONStorage,
  unstable_withStorageValidator as withStorageValidator,
} from "jotai/utils";

const storage = withStorageValidator((value): value is boolean => typeof value === "boolean")(
  createJSONStorage(() => localStorage),
);

/** Device-local creation behavior: return to Selection after placing one object by default. */
export const keepCreationToolAtom = atomWithStorage(
  "musart.keep-creation-tool.v1",
  false,
  storage,
  { getOnInit: true },
);
