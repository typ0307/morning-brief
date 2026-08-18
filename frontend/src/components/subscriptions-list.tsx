"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { BriefingStatus, SubscriptionRow } from "@/lib/types";

function isToday(dateStr: string): boolean {
  const [y, m, d] = dateStr.split("-").map(Number);
  const now = new Date();
  return (
    y === now.getFullYear() &&
    m === now.getMonth() + 1 &&
    d === now.getDate()
  );
}

function formatDate(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${m}월 ${d}일`;
}

type Props = {
  subscriptions: SubscriptionRow[];
  briefingStatus: Record<string, BriefingStatus>;
};

export default function SubscriptionsList({
  subscriptions,
  briefingStatus,
}: Props) {
  const router = useRouter();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [unsubscribing, setUnsubscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unsubscribe(id: string) {
    setUnsubscribing(true);
    setError(null);
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("subscriptions")
      .delete()
      .eq("id", id);
    setUnsubscribing(false);
    if (deleteError) {
      setError(`구독 해지에 실패했습니다: ${deleteError.message}`);
      return;
    }
    setConfirmingId(null);
    router.refresh();
  }

  if (subscriptions.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
        구독 중인 키워드가 없습니다.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {subscriptions.map((s) => {
          const status = briefingStatus[s.topic_id];
          const latestDate = status?.latestDate ?? null;
          const confirming = confirmingId === s.id;
          const keyword = s.topics?.keyword ?? "키워드";

          return (
            <li
              key={s.id}
              className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Link
                    href={`/?topic=${encodeURIComponent(s.topic_id)}`}
                    className="truncate font-medium text-zinc-900 transition-colors hover:text-zinc-500"
                  >
                    {keyword}
                  </Link>
                  {latestDate && isToday(latestDate) && (
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      오늘 ✓
                    </span>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-zinc-400">
                    {latestDate ? formatDate(latestDate) : "브리핑 없음"}
                  </span>
                  {confirming ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-zinc-500">
                        정말 해지할까요?
                      </span>
                      <button
                        type="button"
                        onClick={() => unsubscribe(s.id)}
                        disabled={unsubscribing}
                        className="rounded-full border border-rose-300 px-2.5 py-1 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
                      >
                        해지
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          setConfirmingId(null);
                        }}
                        disabled={unsubscribing}
                        className="rounded-full border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-50"
                      >
                        취소
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setConfirmingId(s.id);
                      }}
                      className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100"
                    >
                      구독 해지
                    </button>
                  )}
                </div>
              </div>

              {confirming && error && (
                <p className="text-xs text-rose-600">{error}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
