import { getCurrentUser } from "@/lib/auth";
import SubscribeForm from "@/components/subscribe-form";
import SubscriptionsList from "@/components/subscriptions-list";
import RecommendedKeywords from "@/components/recommended-keywords";
import type {
  BriefingStatus,
  RecommendedKeyword,
  SubscriptionRow,
} from "@/lib/types";

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

  const subscriptions = (subscriptionsData ??
    []) as unknown as SubscriptionRow[];
  const topicIds = subscriptions.map((s) => s.topic_id);
  const existingKeywords = subscriptions
    .map((s) => s.topics?.keyword)
    .filter((k): k is string => Boolean(k));

  const briefingStatus: Record<string, BriefingStatus> = {};
  if (topicIds.length > 0) {
    const { data: briefingsData } = await supabase
      .from("briefings")
      .select("topic_id, brief_date")
      .in("topic_id", topicIds);

    const rows = (briefingsData ?? []) as {
      topic_id: string;
      brief_date: string;
    }[];

    for (const b of rows) {
      const current = briefingStatus[b.topic_id];
      if (!current || !current.latestDate || b.brief_date > current.latestDate) {
        briefingStatus[b.topic_id] = { latestDate: b.brief_date };
      }
    }
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffStr = `${cutoff.getFullYear()}-${String(
    cutoff.getMonth() + 1,
  ).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;

  const [{ data: popularData }, { data: topicsData }] = await Promise.all([
    supabase.from("briefings").select("topic_id").gte("brief_date", cutoffStr),
    supabase.from("topics").select("id, keyword"),
  ]);

  const topicKeywords = new Map<string, string>(
    ((topicsData ?? []) as { id: string; keyword: string }[]).map((t) => [
      t.id,
      t.keyword,
    ]),
  );

  const counts = new Map<string, number>();
  for (const b of (popularData ?? []) as { topic_id: string }[]) {
    counts.set(b.topic_id, (counts.get(b.topic_id) ?? 0) + 1);
  }

  const myTopicSet = new Set(topicIds);
  const recommended: RecommendedKeyword[] = [...counts.entries()]
    .map(([id, count]) => ({
      id,
      keyword: topicKeywords.get(id) ?? "",
      briefCount: count,
    }))
    .filter((r) => r.keyword && !myTopicSet.has(r.id))
    .sort((a, b) => b.briefCount - a.briefCount)
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="mb-1 text-xl font-bold">키워드 구독</h1>
        <p className="mb-4 text-sm text-zinc-500">
          구독한 키워드의 브리핑이 매일 생성되어 텔레그램으로 발송됩니다.
        </p>
        <SubscribeForm userId={row.id} existingKeywords={existingKeywords} />
      </div>

      {recommended.length > 0 && (
        <RecommendedKeywords userId={row.id} items={recommended} />
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold text-zinc-500">내 구독 목록</h2>
        <SubscriptionsList
          subscriptions={subscriptions}
          briefingStatus={briefingStatus}
        />
      </div>
    </div>
  );
}
