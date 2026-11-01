/** Canonical document identity prevents measurements surviving edits or same-ID reloads. */
export interface ExportSizeKey {
  document: object;
  settings: string;
}
export interface ExportSizeRequest {
  key: ExportSizeKey;
  targetBytes?: number | null;
}
export function exportSizeKey(document: object, settings: readonly unknown[]): ExportSizeKey {
  return { document, settings: JSON.stringify(settings) };
}
export function sameExportSizeKey(a?: ExportSizeKey, b?: ExportSizeKey) {
  return !!a && !!b && a.document === b.document && a.settings === b.settings;
}
/** Session-local scalar measurements; never retain a document or the exported file. */
export class ExportMeasurements {
  private documents = new WeakMap<object, Map<string, number>>();
  read(key: ExportSizeKey) {
    return this.documents.get(key.document)?.get(key.settings);
  }
  record(key: ExportSizeKey, bytes: number) {
    let values = this.documents.get(key.document);
    if (!values) this.documents.set(key.document, (values = new Map()));
    values.delete(key.settings);
    values.set(key.settings, bytes);
    if (values.size > 32) values.delete(values.keys().next().value!);
  }
}
