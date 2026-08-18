export type BriefingRow = {
  id: string;
  brief_date: string;
  topic_id: string;
  summary: {
    title?: string;
    summary?: string[];
    sentiment?: string;
  };
  topics?: { keyword: string } | null;
  articles?: { title: string; url: string; snippet: string }[] | null;
};

export type TopicRow = {
  id: string;
  keyword: string;
};

export type SubscriptionRow = {
  id: string;
  topic_id: string;
  topics?: { keyword: string } | null;
};

export type SendScheduleRow = {
  id: string;
  user_id: string;
  day_times: Record<string, string[]>;
  enabled: boolean;
  updated_at: string;
};

export type BriefingStatus = {
  latestDate: string | null;
};

export type RecommendedKeyword = {
  id: string;
  keyword: string;
  briefCount: number;
};
