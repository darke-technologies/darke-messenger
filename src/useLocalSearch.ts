import { useEffect, useMemo, useState } from "react";
import type { DmThread } from "./dmSessions";
import {
  queryChatIndex,
  searchThreadsLocal,
  type IndexedChatHit,
} from "./searchIndex";

export function useLocalSearch(slug: string, threads: DmThread[], query: string) {
  const [idbHits, setIdbHits] = useState<IndexedChatHit[]>([]);
  const localHits = useMemo(
    () => searchThreadsLocal(slug, threads, query),
    [slug, threads, query],
  );

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setIdbHits([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void queryChatIndex(slug, q).then((rows) => {
        if (!cancelled) setIdbHits(rows);
      });
    }, 80);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [slug, query]);

  const hits = idbHits.length ? idbHits : localHits;
  return { hits, localHits };
}
