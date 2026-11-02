import { parseProject } from "@musart/core";
import { projectArchive } from "./client";
function read(file: Blob, binary: boolean): Promise<string | ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (binary ? result instanceof ArrayBuffer : typeof result === "string")
        resolve(result as string | ArrayBuffer);
      else reject(Error("Contenu du fichier invalide."));
    };
    reader.onerror = () => reject(Error("Lecture du projet impossible."));
    if (binary) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
  });
}
export async function readPortable(file: File) {
  if (file.size > 512 * 1024 * 1024) throw Error("Projet trop volumineux (maximum 512 Mo).");
  const header = new Uint8Array((await read(file.slice(0, 4), true)) as ArrayBuffer);
  if (header[0] === 80 && header[1] === 75) {
    const result = await projectArchive({ kind: "decode", blob: file });
    if (!("project" in result)) throw Error("Invalid archive response.");
    return result;
  }
  if (file.size > 200 * 1024 * 1024) throw Error("Projet trop volumineux (maximum 200 Mo).");
  return { project: parseProject((await read(file, false)) as string), originals: [] };
}
