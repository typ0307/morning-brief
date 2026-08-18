"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { subscribeKeywords } from "@/lib/subscribe";
import type { RecommendedKeyword } from "@/lib/types";

type Props = {
  userId: string;
  items: RecommendedKeyword[];
};

export default function RecommendedKeywords({ userId, items }: Props) {
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  function showToast(text: string) {
    setMessage(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setMessage(null), 3000);
  }

  async function subscribe(item: RecommendedKeyword) {
    setBusyId(item.id);
    setError(null);
    const result = await subscribeKeywords(userId, [item.keyword]);
    setBusyId(null);

    if (result.error) {
      setError(result.error);
      return;
    }

    setSubscribedIds((prev) => new Set(prev).add(item.id));
    showToast(
      result.added > 0 ? "구독되었습니다." : "이미 구독 중인 키워드입니다.",
    );
    router.refresh();
  }

  const visible = items.filter((item) => !subscribedIds.has(item.id));
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div>
        <h2 className="text-sm font-semibold text-zinc-500">인기 키워드</h2>
        <p className="text-xs text-zinc-400">
          최근 2주간 브리핑이 많이 생성된 키워드입니다.
        </p>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {visible.map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white py-1 pl-3 pr-1"
          >
            <span className="text-sm font-medium text-zinc-700">
              {item.keyword}
            </span>
            <span className="text-[10px] text-zinc-400">
              브리핑 {item.briefCount}회
            </span>
            <button
              type="button"
              onClick={() => subscribe(item)}
              disabled={busyId === item.id}
              className="rounded-full bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
            >
              구독
            </button>
          </li>
        ))}
      </ul>
      {message && <p className="text-sm text-emerald-600">{message}</p>}
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}
