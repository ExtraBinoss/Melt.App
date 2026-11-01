/** Originals stay in the shared media directory or the requesting template's own directory. */
export function isTemplateOriginalPath(templateId: string, file: unknown): file is string {
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(templateId) ||
    typeof file !== "string" ||
    file.includes("..")
  )
    return false;
  return ["media/", `${templateId}/media/`].some(
    (prefix) =>
      file.startsWith(prefix) &&
      /^[a-zA-Z0-9][a-zA-Z0-9.-]*\.(?:mp4|wav)$/.test(file.slice(prefix.length)),
  );
}
