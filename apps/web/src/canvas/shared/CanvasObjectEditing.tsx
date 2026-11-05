import { StudioCanvasViewport } from "../../ui/studio/framing/StudioCanvasViewport";
import { CanvasTextEditing } from "../text/CanvasTextEditing";
import { CanvasVectorEditing } from "../vector/CanvasVectorEditing";
import { CanvasSpatialEditing, type SpatialCanvasProps } from "../spatial/CanvasSpatialEditing";
export function CanvasObjectEditing(
  props: SpatialCanvasProps & { onError?: (error: string) => void },
) {
  return (
    <>
      <StudioCanvasViewport {...props} />
      <CanvasTextEditing {...props} />
      <CanvasVectorEditing {...props} />
      <CanvasSpatialEditing {...props} />
    </>
  );
}
