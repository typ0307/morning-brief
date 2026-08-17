import { getCurrentUser } from "@/lib/auth";
import SubscribeForm from "@/components/subscribe-form";
import SubscriptionsList from "@/components/subscriptions-list";
import type { SubscriptionRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function KeywordsPage() {
  const { supabase, row } = await getCurrentUser();

  if (!row) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        사용자 정보를 찾을 수 없습니다. 잠시 후 다시 시도해 주세요.
      </div>
    );
  }

  const { data: subscriptionsData } = await supabase
    .from("subscriptions")
    .select("id, topic_id, topics(keyword)")
    .eq("user_id", row.id)
    .order("created_at", { ascending: true });

  const subscriptions = (subscriptionsData ?? []) as unknown as SubscriptionRow[];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="mb-1 text-xl font-bold">키워드 구독</h1>
        <p className="mb-4 text-sm text-zinc-500">
          구독한 키워드의 브리핑이 매일 생성되어 텔레그램으로 발송됩니다.
        </p>
        <SubscribeForm userId={row.id} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-zinc-500">내 구독 목록</h2>
        <SubscriptionsList subscriptions={subscriptions} />
      </div>
    </div>
  );
}
