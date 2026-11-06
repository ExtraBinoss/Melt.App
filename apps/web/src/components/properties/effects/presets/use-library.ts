import { useCallback, useEffect, useRef, useState } from "react";
import { EffectPresetStore, type TreatmentHeader } from "../../../../services/effect-presets/store";
export function useEffectLibrary(enabled = true) {
  const store = useRef<EffectPresetStore | null>(null);
  const epoch = useRef({ value: 0 });
  const [items, setItems] = useState<TreatmentHeader[]>([]);
  const [before, setBefore] = useState<[number, string] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(enabled);
  const getStore = useCallback(() => (store.current ??= new EffectPresetStore()), []);
  const refresh = useCallback(
    async (after?: [number, string]) => {
      const token = ++epoch.current.value;
      setError("");
      setBusy(true);
      try {
        const result = await getStore().list(after);
        if (epoch.current.value === token) {
          setItems((items) => (after ? [...items, ...result.items] : result.items));
          setBefore(result.before);
        }
      } catch (reason) {
        if (epoch.current.value === token)
          setError(reason instanceof Error ? reason.message : "Library unavailable");
      } finally {
        if (epoch.current.value === token) setBusy(false);
      }
    },
    [getStore],
  );
  useEffect(() => {
    if (!enabled) return;
    const lifetime = epoch.current;
    const token = ++lifetime.value;
    const owned = getStore();
    void owned
      .list()
      .then(
        (result) => {
          if (lifetime.value === token) {
            setItems(result.items);
            setBefore(result.before);
          }
        },
        (reason: unknown) => {
          if (lifetime.value === token)
            setError(reason instanceof Error ? reason.message : "Library unavailable");
        },
      )
      .finally(() => {
        if (lifetime.value === token) setBusy(false);
      });
    return () => {
      lifetime.value++;
      owned.dispose();
      store.current = null;
    };
  }, [enabled, getStore]);
  return { getStore, items, before, refresh, error, setError, busy };
}
