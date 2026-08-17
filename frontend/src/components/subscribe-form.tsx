"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SubscribeForm({ userId }: { userId: string }) {
  const [keyword, setKeyword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = keyword.trim();
    if (!value) return;

    setSubmitting(true);
    setError(null);
    const supabase = createClient();

    const { data: upserted, error: upsertError } = await supabase
      .from("topics")
      .upsert({ keyword: value }, { onConflict: "keyword", ignoreDuplicates: true })
      .select("id")
      .maybeSingle();

    if (upsertError) {
      setError(`키워드 등록에 실패했습니다: ${upsertError.message}`);
      setSubmitting(false);
      return;
    }

    let topicId = upserted?.id;
    if (!topicId) {
      const { data: existing } = await supabase
        .from("topics")
        .select("id")
        .eq("keyword", value)
        .maybeSingle();
      topicId = existing?.id;
    }

    if (!topicId) {
      setError("키워드를 등록할 수 없습니다.");
      setSubmitting(false);
      return;
    }

    const { error: subscribeError } = await supabase
      .from("subscriptions")
      .upsert(
        { user_id: userId, topic_id: topicId },
        { onConflict: "user_id,topic_id", ignoreDuplicates: true }
      );

    if (subscribeError) {
      setError(`구독에 실패했습니다: ${subscribeError.message}`);
      setSubmitting(false);
      return;
    }

    setKeyword("");
    setSubmitting(false);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="새 키워드 (예: 애플, AI)"
          className="h-11 flex-1 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-900"
        />
        <button
          type="submit"
          disabled={submitting || !keyword.trim()}
          className="h-11 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
        >
          추가
        </button>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </form>
  );
}
