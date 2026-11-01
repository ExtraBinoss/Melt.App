import { useEffect } from "react";
import { brand } from "../../ui/brand/config";
/** Own the editor tab title only while its project is visible; routes retain their own titles. */
export function useProjectTitle(name: string, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const previous = document.title;
    const title = `${name} - ${brand.name}`;
    document.title = title;
    return () => {
      if (document.title === title) document.title = previous;
    };
  }, [name, active]);
}
