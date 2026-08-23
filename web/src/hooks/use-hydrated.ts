import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";

export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => {
    if (typeof window === "undefined") return false;
    return useApp.persist.hasHydrated();
  });

  useEffect(() => {
    const unsub = useApp.persist.onFinishHydration(() => setHydrated(true));
    if (useApp.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, []);

  return hydrated;
}
