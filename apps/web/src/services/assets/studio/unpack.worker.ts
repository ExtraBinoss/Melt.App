import { unpackStudioZip } from "./unpack";
import type { StudioManifest } from "./integrity";
const scope = self as unknown as {
  onmessage:
    | ((event: MessageEvent<{ bytes: Uint8Array; manifest: StudioManifest }>) => void)
    | null;
  postMessage: (message: unknown, transfer: Transferable[]) => void;
};
scope.onmessage = ({ data }) => {
  try {
    const files = unpackStudioZip(data.bytes, data.manifest);
    scope.postMessage(
      { files },
      Object.values(files).map((bytes) => bytes.buffer as ArrayBuffer),
    );
  } catch (error) {
    scope.postMessage(
      { error: error instanceof Error ? error.message : "Pack extraction failed" },
      [],
    );
  }
};
