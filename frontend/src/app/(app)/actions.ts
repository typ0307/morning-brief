"use server";

import { getCurrentUser } from "@/lib/auth";
import { BRIEFING_PAGE_SIZE } from "@/lib/briefings";
import type { BriefingRow } from "@/lib/types";

export async function loadMoreBriefings(input: {
  topicId: string | null;
  offset: number;
}): Promise<{
  briefings: BriefingRow[];
  nextOffset: number;
  hasMore: boolean;
}> {
  const { supabase, row } = await getCurrentUser();
  if (!row) throw new Error("로그인이 필요합니다.");

  const offset = Math.max(0, Math.floor(input.offset) || 0);

  const { data: subsData } = await supabase
    .from("subscriptions")
    .select("id, topic_id")
    .eq("user_id", row.id);

  const topicIds = ((subsData ?? []) as { topic_id: string }[]).map(
    (s) => s.topic_id,
  );
  if (topicIds.length === 0) {
    return { briefings: [], nextOffset: offset, hasMore: false };
  }

  if (input.topicId && !topicIds.includes(input.topicId)) {
    return { briefings: [], nextOffset: offset, hasMore: false };
  }

  let query = supabase
    .from("briefings")
    .select(
      "id, brief_date, summary, topic_id, topics(keyword), articles(title, url)",
    )
    .in("topic_id", topicIds)
    .order("brief_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + BRIEFING_PAGE_SIZE - 1);

  if (input.topicId) {
    query = query.eq("topic_id", input.topicId);
  }

  const { data } = await query;
  const briefings = (data ?? []) as unknown as BriefingRow[];
  return {
    briefings,
    nextOffset: offset + briefings.length,
    hasMore: briefings.length === BRIEFING_PAGE_SIZE,
  };
}
