import { ProjectStore } from "../projects/storage";
import { ThumbnailPipeline } from "../projects/thumbnails";
import { ThumbnailRenderer } from "../projects/thumbnails/renderer";
import { FontLibrary } from "../fonts/library";
import { ThumbnailActivity } from "../projects/thumbnails/activity";

/** The library reads the same stores and cached previews without constructing an editing session. */
export function createLibraryData(onError: (error: unknown) => void) {
  const store = new ProjectStore();
  const fonts = new FontLibrary();
  const activity = new ThumbnailActivity();
  const thumbnails = new ThumbnailPipeline(store, {
    onError,
    activity,
    renderer: new ThumbnailRenderer(undefined, fonts.resolve),
  });
  let closing: Promise<void> | undefined;
  return {
    store,
    fonts,
    thumbnails,
    activity,
    dispose() {
      return (closing ??= (async () => {
        fonts.dispose();
        try {
          await thumbnails.dispose();
        } finally {
          await store.close();
        }
      })());
    },
  };
}
export type LibraryData = ReturnType<typeof createLibraryData>;
