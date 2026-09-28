import { useMemo, useSyncExternalStore } from "react";
import { readAppRoute, type AppRoute } from "./appRouter";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
  };
}

// A string snapshot stays referentially stable. React checks it again after
// subscribing, so a navigation between the first render and effects is not lost.
const snapshot = () => window.location.hash;

export function useAppRoute(): AppRoute {
  const hash = useSyncExternalStore(subscribe, snapshot);
  return useMemo(() => readAppRoute(hash), [hash]);
}
