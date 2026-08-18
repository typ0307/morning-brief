import { createClient } from "@/lib/supabase/client";

export type SubscribeResult = {
  added: number;
  already: number;
  error?: string;
};

export async function subscribeKeywords(
  userId: string,
  keywords: string[],
): Promise<SubscribeResult> {
  const supabase = createClient();
  const normalized = [
    ...new Set(keywords.map((k) => k.trim()).filter(Boolean)),
  ];
  if (normalized.length === 0) return { added: 0, already: 0 };

  const { data: existingData } = await supabase
    .from("subscriptions")
    .select("topics(keyword)")
    .eq("user_id", userId);

  const subscribed = new Set(
    ((existingData ?? []) as { topics?: { keyword?: string } | null }[])
      .map((s) => s.topics?.keyword?.trim().toLowerCase())
      .filter((k): k is string => Boolean(k)),
  );

  let added = 0;
  let already = 0;

  for (const keyword of normalized) {
    const isAlready = subscribed.has(keyword.toLowerCase());

    const { data: upserted, error: upsertError } = await supabase
      .from("topics")
      .upsert({ keyword }, { onConflict: "keyword", ignoreDuplicates: true })
      .select("id")
      .maybeSingle();

    if (upsertError) {
      return {
        added,
        already,
        error: `키워드 등록에 실패했습니다: ${upsertError.message}`,
      };
    }

    let topicId = upserted?.id;
    if (!topicId) {
      const { data: existing } = await supabase
        .from("topics")
        .select("id")
        .eq("keyword", keyword)
        .maybeSingle();
      topicId = existing?.id;
    }

    if (!topicId) {
      return { added, already, error: "키워드를 등록할 수 없습니다." };
    }

    const { error: subscribeError } = await supabase
      .from("subscriptions")
      .upsert(
        { user_id: userId, topic_id: topicId },
        { onConflict: "user_id,topic_id", ignoreDuplicates: true },
      );

    if (subscribeError) {
      return {
        added,
        already,
        error: `구독에 실패했습니다: ${subscribeError.message}`,
      };
    }

    if (isAlready) {
      already++;
    } else {
      added++;
      subscribed.add(keyword.toLowerCase());
    }
  }

  return { added, already };
}
