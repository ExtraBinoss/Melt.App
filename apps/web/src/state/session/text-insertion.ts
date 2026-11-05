import { atom } from "jotai";

export type TextInsertionMode = "2d" | "3d";
/** Explicit choices override each workspace's default without entering the document. */
export const textInsertionModeAtom = atom<TextInsertionMode | null>(null);
