import { createStart } from "@tanstack/react-start";

/** Public pages and the library render on the server; the editor opts into client-only rendering. */
export const startInstance = createStart(() => ({ defaultSsr: true }));
