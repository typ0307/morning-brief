import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import BriefingList from "@/components/briefing-list";
import { BRIEFING_PAGE_SIZE } from "@/lib/briefings";
import type { BriefingRow, SubscriptionRow } from "@/lib/types";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const params = await searchParams;
  const topic = typeof params.topic === "string" ? params.topic : undefined;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        로그인이 필요합니다.
      </div>
    );
  }

  const { data: userRow } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!userRow) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        사용자 정보를 찾을 수 없습니다. 잠시 후 다시 시도해 주세요.
      </div>
    );
  }

  const { data: subsData } = await supabase
    .from("subscriptions")
    .select("id, topic_id, topics(keyword)")
    .eq("user_id", userRow.id)
    .order("created_at", { ascending: true });

  const subscriptions = (subsData ?? []) as unknown as SubscriptionRow[];
  const topicIds = subscriptions.map((s) => s.topic_id);

  let briefings: BriefingRow[] = [];
  if (topicIds.length > 0) {
    let query = supabase
      .from("briefings")
      .select(
        "id, brief_date, summary, topic_id, topics(keyword), articles(title, url)"
      )
      .in("topic_id", topicIds)
      .order("brief_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(BRIEFING_PAGE_SIZE);

    if (topic) {
      query = query.eq("topic_id", topic);
    }

    const { data: briefingsData } = await query;
    briefings = (briefingsData ?? []) as unknown as BriefingRow[];
  }

  if (subscriptions.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
          구독 중인 키워드가 없습니다.{" "}
          <Link href="/keywords" className="font-medium underline">
            키워드 페이지
          </Link>
          에서 구독해 주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        <Link
          href="/"
          className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
            !topic
              ? "border-zinc-900 bg-zinc-900 text-white"
              : "border-zinc-300 text-zinc-600 hover:bg-zinc-100"
          }`}
        >
          전체
        </Link>
        {subscriptions.map((s) => (
          <Link
            key={s.topic_id}
            href={`/?topic=${encodeURIComponent(s.topic_id)}`}
            className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
              topic === s.topic_id
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-300 text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            {s.topics?.keyword ?? "키워드"}
          </Link>
        ))}
      </div>

      {briefings.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
          아직 생성된 브리핑이 없습니다.
        </p>
      ) : (
        <BriefingList
          key={topic ?? "all"}
          initialBriefings={briefings}
          hasMore={briefings.length === BRIEFING_PAGE_SIZE}
          topicId={topic ?? null}
        />
      )}
    </div>
  );
}
