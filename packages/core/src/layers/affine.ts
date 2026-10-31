import type { Layer } from "../document/model";
import { invertMatrix, layerTransform, multiplyMatrices, type Matrix } from "./geometry";

/** Retain authored scale and the requested rotation, without decomposing away shear.
 * Coordinates continue to locate the untransformed frame's upper-left corner. */
export function setLayerTransform(layer: Layer, matrix: Matrix, rotation: number): void {
  const authoredLayer = { ...layer, x: 0, y: 0, rotation };
  delete authoredLayer.affine;
  const authored = layerTransform(authoredLayer);
  const residual = multiplyMatrices(invertMatrix(authored), matrix);
  layer.rotation = rotation;
  layer.affine = [residual[0], residual[1], residual[2], residual[3]];
  const cx = layer.width / 2,
    cy = layer.height / 2;
  layer.x = matrix[4] + matrix[0] * cx + matrix[2] * cy - cx;
  layer.y = matrix[5] + matrix[1] * cx + matrix[3] * cy - cy;
}
