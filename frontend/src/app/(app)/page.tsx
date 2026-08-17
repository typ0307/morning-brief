import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import BriefingCard from "@/components/briefing-card";
import type { BriefingRow, TopicRow } from "@/lib/types";

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

  const topicsQuery = supabase
    .from("topics")
    .select("id, keyword")
    .order("keyword", { ascending: true });

  let briefingsQuery = supabase
    .from("briefings")
    .select(
      "id, brief_date, summary, topic_id, topics(keyword), articles(title, url, snippet)"
    )
    .order("brief_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (topic) {
    briefingsQuery = briefingsQuery.eq("topic_id", topic);
  }

  const [
    { data: topicsData, error: topicsError },
    { data: briefingsData, error: briefingsError },
  ] = await Promise.all([topicsQuery, briefingsQuery]);

  if (topicsError || briefingsError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        브리핑을 불러오지 못했습니다.
      </div>
    );
  }

  const topics = (topicsData ?? []) as unknown as TopicRow[];
  const briefings = (briefingsData ?? []) as unknown as BriefingRow[];

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
        {topics.map((t) => (
          <Link
            key={t.id}
            href={`/?topic=${encodeURIComponent(t.id)}`}
            className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
              topic === t.id
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-300 text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            {t.keyword}
          </Link>
        ))}
      </div>

      {briefings.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
          아직 생성된 브리핑이 없습니다.
        </p>
      ) : (
        briefings.map((b) => <BriefingCard key={b.id} briefing={b} />)
      )}
    </div>
  );
}
