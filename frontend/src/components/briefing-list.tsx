"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadMoreBriefings } from "@/app/(app)/actions";
import BriefingCard from "@/components/briefing-card";
import type { BriefingRow } from "@/lib/types";

type Props = {
  initialBriefings: BriefingRow[];
  hasMore: boolean;
  topicId: string | null;
};

export default function BriefingList({
  initialBriefings,
  hasMore,
  topicId,
}: Props) {
  const [briefings, setBriefings] = useState<BriefingRow[]>(initialBriefings);
  const [more, setMore] = useState(hasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offsetRef = useRef(initialBriefings.length);
  const busyRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (busyRef.current || !more) return;
    busyRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await loadMoreBriefings({
        topicId,
        offset: offsetRef.current,
      });
      setBriefings((prev) => {
        const seen = new Set(prev.map((b) => b.id));
        return [...prev, ...result.briefings.filter((b) => !seen.has(b.id))];
      });
      offsetRef.current = result.nextOffset;
      setMore(result.hasMore);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "추가 브리핑을 불러오지 못했습니다.",
      );
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }, [more, topicId]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !more) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      { rootMargin: "600px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, more]);

  return (
    <>
      {briefings.map((b) => (
        <BriefingCard key={b.id} briefing={b} />
      ))}

      <div ref={sentinelRef}>
        {loading && (
          <p className="py-4 text-center text-sm text-zinc-400">
            불러오는 중...
          </p>
        )}
        {error && (
          <div className="flex items-center justify-center gap-2 py-4">
            <p className="text-sm text-rose-600">{error}</p>
            <button
              type="button"
              onClick={() => void loadMore()}
              className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100"
            >
              다시 시도
            </button>
          </div>
        )}
        {!more && !loading && briefings.length > 0 && (
          <p className="py-4 text-center text-xs text-zinc-400">
            모든 브리핑을 확인했습니다.
          </p>
        )}
      </div>
    </>
  );
}
