"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SubscriptionRow } from "@/lib/types";

export default function SubscriptionsList({
  subscriptions,
}: {
  subscriptions: SubscriptionRow[];
}) {
  const router = useRouter();

  async function unsubscribe(subscription: SubscriptionRow) {
    const supabase = createClient();
    await supabase
      .from("subscriptions")
      .delete()
      .eq("id", subscription.id);
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
    <ul className="flex flex-col gap-2">
      {subscriptions.map((s) => (
        <li
          key={s.id}
          className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3"
        >
          <span className="font-medium">{s.topics?.keyword ?? "키워드"}</span>
          <button
            onClick={() => unsubscribe(s)}
            className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100"
          >
            구독 해지
          </button>
        </li>
      ))}
    </ul>
  );
}
