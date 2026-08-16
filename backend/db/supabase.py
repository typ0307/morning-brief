from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

from supabase import create_client


class SupabaseDB:
    def __init__(self, url: str, service_role_key: str):
        self.client = create_client(url, service_role_key)

    def list_active_topics(self) -> List[Dict[str, Any]]:
        subs = self.client.table("subscriptions").select("topic_id").execute().data
        topic_ids = list({s["topic_id"] for s in subs})
        if not topic_ids:
            return []
        return self.client.table("topics").select("*").in_("id", topic_ids).execute().data

    def list_subscribed_users(self) -> List[Dict[str, Any]]:
        subs = self.client.table("subscriptions").select("user_id").execute().data
        user_ids = list({s["user_id"] for s in subs})
        if not user_ids:
            return []
        return self.client.table("users").select("*").in_("id", user_ids).execute().data

    def list_user_topics(self, user_id: str) -> List[Dict[str, Any]]:
        subs = self.client.table("subscriptions").select("topic_id").eq("user_id", user_id).execute().data
        topic_ids = [s["topic_id"] for s in subs]
        if not topic_ids:
            return []
        return self.client.table("topics").select("*").in_("id", topic_ids).execute().data

    def existing_urls(self, urls: List[str]) -> Set[str]:
        if not urls:
            return set()
        rows = self.client.table("articles").select("url").in_("url", urls).execute().data
        return {r["url"] for r in rows}

    def insert_articles(self, articles: List[Dict[str, Any]]) -> None:
        if not articles:
            return
        self.client.table("articles").upsert(articles, ignore_duplicates=True, on_conflict="url").execute()

    def update_article_body(self, article_id: str, body: str) -> None:
        self.client.table("articles").update({"body": body}).eq("id", article_id).execute()

    def get_user_candidate_articles(
        self, topic_ids: List[str], since: datetime, per_topic_limit: int
    ) -> List[Dict[str, Any]]:
        combined = []
        seen = set()
        for tid in topic_ids:
            rows = (
                self.client.table("articles")
                .select("*")
                .eq("topic_id", tid)
                .gte("created_at", since.isoformat())
                .order("published_at", desc=True)
                .limit(per_topic_limit)
                .execute()
                .data
            )
            for r in rows:
                if r["id"] not in seen:
                    seen.add(r["id"])
                    combined.append(r)
        return combined

    def get_briefing_for_user(self, user_id: str, brief_date: str) -> Optional[Dict[str, Any]]:
        rows = (
            self.client.table("briefings")
            .select("*")
            .eq("user_id", user_id)
            .eq("brief_date", brief_date)
            .execute()
            .data
        )
        return rows[0] if rows else None

    def create_user_briefing(self, user_id: str, brief_date: str, summary: Dict[str, Any]) -> Dict[str, Any]:
        return (
            self.client.table("briefings")
            .insert({"user_id": user_id, "brief_date": brief_date, "summary": summary})
            .execute()
            .data[0]
        )

    def mark_articles_briefed(self, article_ids: List[str], briefing_id: str) -> None:
        if not article_ids:
            return
        self.client.table("briefing_articles").insert(
            [{"briefing_id": briefing_id, "article_id": aid} for aid in article_ids]
        ).execute()

    def get_articles_for_briefing(self, briefing_id: str) -> List[Dict[str, Any]]:
        rows = (
            self.client.table("briefing_articles")
            .select("articles(title, url)")
            .eq("briefing_id", briefing_id)
            .execute()
            .data
        )
        return [r["articles"] for r in rows if r.get("articles")]

    def get_deliveries(self, briefing_id: str) -> List[Dict[str, Any]]:
        return self.client.table("deliveries").select("*").eq("briefing_id", briefing_id).execute().data

    def record_delivery(self, briefing_id: str, user_id: str, status: str) -> None:
        payload = {
            "briefing_id": briefing_id,
            "user_id": user_id,
            "status": status,
            "sent_at": datetime.now(timezone.utc).isoformat() if status == "sent" else None,
        }
        self.client.table("deliveries").upsert(payload, on_conflict="briefing_id,user_id").execute()

    def upsert_topic(self, keyword: str) -> Dict[str, Any]:
        return self.client.table("topics").upsert({"keyword": keyword}, on_conflict="keyword").execute().data[0]

    def upsert_user(self, telegram_chat_id: str) -> Dict[str, Any]:
        return (
            self.client.table("users")
            .upsert({"telegram_chat_id": telegram_chat_id}, on_conflict="telegram_chat_id")
            .execute()
            .data[0]
        )

    def subscribe(self, user_id: str, topic_id: str) -> None:
        self.client.table("subscriptions").upsert(
            {"user_id": user_id, "topic_id": topic_id}, on_conflict="user_id,topic_id"
        ).execute()
