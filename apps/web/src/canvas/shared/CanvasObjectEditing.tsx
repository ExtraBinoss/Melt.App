import { CanvasVectorEditing } from "../vector/CanvasVectorEditing";
import { CanvasSpatialEditing, type SpatialCanvasProps } from "../spatial/CanvasSpatialEditing";
export function CanvasObjectEditing(props: SpatialCanvasProps) {
  return (
    <>
      <CanvasVectorEditing {...props} />
      <CanvasSpatialEditing {...props} />
    </>
  );
}
