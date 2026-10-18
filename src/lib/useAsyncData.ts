"use client";

import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "./api";

type Snapshot<T> = { data: T | null; error: string; fetcher: (() => Promise<T>) | null; version: number; refreshKey: unknown };

/**
 * Loads data for the current `fetcher` (memoize it with useCallback) and re-runs when the
 * fetcher identity, `refreshKey`, or an explicit `reload()` changes. State is only written from
 * promise callbacks, and `loading` is derived, so no setState runs synchronously inside the effect.
 */
export function useAsyncData<T>(fetcher: () => Promise<T>, refreshKey: unknown = null) {
  const [snapshot, setSnapshot] = useState<Snapshot<T>>({ data: null, error: "", fetcher: null, version: 0, refreshKey: null });
  const [version, setVersion] = useState(1);

  useEffect(() => {
    let cancelled = false;
    fetcher()
      .then((data) => { if (!cancelled) setSnapshot({ data, error: "", fetcher, version, refreshKey }); })
      .catch((caught: unknown) => {
        if (!cancelled) setSnapshot((current) => ({ data: current.data, error: errorMessage(caught, "The request failed."), fetcher, version, refreshKey }));
      });
    return () => { cancelled = true; };
  }, [fetcher, version, refreshKey]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  const loading = snapshot.fetcher !== fetcher || snapshot.version !== version || snapshot.refreshKey !== refreshKey;
  return { data: snapshot.data, error: snapshot.error, loading, reload };
}
