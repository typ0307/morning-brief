"""Supabase DB 레이어 (service_role 키로 RLS 우회 접근)."""

from datetime import datetime, timezone
from typing import Any

from supabase import create_client


class SupabaseDB:
    def __init__(self, url: str, service_role_key: str):
        self.client = create_client(url, service_role_key)

    def list_active_topics(self) -> list[dict[str, Any]]:
        subs = self.client.table("subscriptions").select("topic_id").execute().data
        topic_ids = list({s["topic_id"] for s in subs})
        if not topic_ids:
            return []
        return self.client.table("topics").select("*").in_("id", topic_ids).execute().data

    def list_subscribers(self, topic_id: str) -> list[dict[str, Any]]:
        subs = self.client.table("subscriptions").select("user_id").eq("topic_id", topic_id).execute().data
        user_ids = [s["user_id"] for s in subs]
        if not user_ids:
            return []
        return self.client.table("users").select("*").in_("id", user_ids).execute().data

    def existing_urls(self, topic_id: str, urls: list[str]) -> set[str]:
        if not urls:
            return set()
        rows = (
            self.client.table("articles")
            .select("url")
            .eq("topic_id", topic_id)
            .in_("url", urls)
            .execute()
            .data
        )
        return {r["url"] for r in rows}

    def insert_articles(self, articles: list[dict[str, Any]]) -> None:
        if not articles:
            return
        self.client.table("articles").upsert(articles, ignore_duplicates=True, on_conflict="topic_id,url").execute()

    def update_article_body(self, article_id: str, body: str) -> None:
        self.client.table("articles").update({"body": body}).eq("id", article_id).execute()

    def get_pending_articles(self, topic_id: str, limit: int) -> list[dict[str, Any]]:
        return (
            self.client.table("articles")
            .select("*")
            .eq("topic_id", topic_id)
            .is_("briefing_id", "null")
            .order("published_at", desc=True)
            .limit(limit)
            .execute()
            .data
        )

    def get_briefing(self, topic_id: str, brief_date: str, time_slot: str = "") -> dict[str, Any] | None:
        rows = (
            self.client.table("briefings")
            .select("*")
            .eq("topic_id", topic_id)
            .eq("brief_date", brief_date)
            .eq("time_slot", time_slot)
            .execute()
            .data
        )
        return rows[0] if rows else None

    def create_briefing(self, topic_id: str, brief_date: str, summary: dict[str, Any], time_slot: str = "") -> dict[str, Any]:
        return (
            self.client.table("briefings")
            .insert({"topic_id": topic_id, "brief_date": brief_date, "time_slot": time_slot, "summary": summary})
            .execute()
            .data[0]
        )

    def mark_articles_briefed(self, article_ids: list[str], briefing_id: str) -> None:
        if not article_ids:
            return
        self.client.table("articles").update({"briefing_id": briefing_id}).in_("id", article_ids).execute()

    def get_articles_for_briefing(self, briefing_id: str) -> list[dict[str, Any]]:
        return self.client.table("articles").select("title, url").eq("briefing_id", briefing_id).execute().data

    def get_deliveries(self, briefing_id: str) -> list[dict[str, Any]]:
        return self.client.table("deliveries").select("*").eq("briefing_id", briefing_id).execute().data

    def record_delivery(self, briefing_id: str, user_id: str, channel: str, status: str) -> None:
        payload = {
            "briefing_id": briefing_id,
            "user_id": user_id,
            "channel": channel,
            "status": status,
            "sent_at": datetime.now(timezone.utc).isoformat() if status == "sent" else None,
        }
        self.client.table("deliveries").upsert(payload, on_conflict="briefing_id,user_id,channel").execute()

    def upsert_topic(self, keyword: str) -> dict[str, Any]:
        return self.client.table("topics").upsert({"keyword": keyword}, on_conflict="keyword").execute().data[0]

    def upsert_user(self, telegram_chat_id: str) -> dict[str, Any]:
        return (
            self.client.table("users")
            .upsert({"telegram_chat_id": telegram_chat_id}, on_conflict="telegram_chat_id")
            .execute()
            .data[0]
        )

    def upsert_discord_user(self, discord_user_id: str) -> dict[str, Any]:
        return (
            self.client.table("users")
            .upsert({"discord_user_id": discord_user_id}, on_conflict="discord_user_id")
            .execute()
            .data[0]
        )

    def subscribe(self, user_id: str, topic_id: str) -> None:
        self.client.table("subscriptions").upsert(
            {"user_id": user_id, "topic_id": topic_id}, on_conflict="user_id,topic_id"
        ).execute()

    def unsubscribe(self, user_id: str, topic_id: str) -> None:
        self.client.table("subscriptions").delete().eq("user_id", user_id).eq("topic_id", topic_id).execute()

    def list_subscriptions(self, user_id: str) -> list[dict[str, Any]]:
        subs = self.client.table("subscriptions").select("topic_id").eq("user_id", user_id).execute().data
        topic_ids = [s["topic_id"] for s in subs]
        if not topic_ids:
            return []
        return (
            self.client.table("topics")
            .select("id, keyword")
            .in_("id", topic_ids)
            .order("keyword")
            .execute()
            .data
        )

    def get_topic_by_keyword(self, keyword: str) -> dict[str, Any] | None:
        rows = self.client.table("topics").select("*").eq("keyword", keyword).execute().data
        return rows[0] if rows else None

    def get_topic(self, topic_id: str) -> dict[str, Any] | None:
        rows = self.client.table("topics").select("*").eq("id", topic_id).execute().data
        return rows[0] if rows else None

    def get_subscribed_topic_ids(self, user_ids: list[str] | set[str]) -> set[str]:
        ids = list(user_ids)
        if not ids:
            return set()
        subs = self.client.table("subscriptions").select("topic_id").in_("user_id", ids).execute().data
        return {s["topic_id"] for s in subs}

    def list_enabled_schedules(self) -> list[dict[str, Any]]:
        return self.client.table("send_schedules").select("*").eq("enabled", True).execute().data

    def get_schedule(self, user_id: str) -> dict[str, Any] | None:
        rows = self.client.table("send_schedules").select("*").eq("user_id", user_id).execute().data
        return rows[0] if rows else None

    def upsert_schedule(self, user_id: str, day_times: dict[str, list[str]], enabled: bool) -> dict[str, Any]:
        return (
            self.client.table("send_schedules")
            .upsert(
                {"user_id": user_id, "day_times": day_times, "enabled": enabled},
                on_conflict="user_id",
            )
            .execute()
            .data[0]
        )

    def link_telegram(self, code: str, telegram_chat_id: str) -> dict[str, Any]:
        return self._link_bot(code, "telegram_chat_id", telegram_chat_id)

    def link_discord(self, code: str, discord_user_id: str) -> dict[str, Any]:
        return self._link_bot(code, "discord_user_id", discord_user_id)

    def _link_bot(self, code: str, field: str, value: str) -> dict[str, Any]:
        rows = self.client.table("link_codes").select("*").eq("code", code).execute().data
        if not rows:
            return {"ok": False, "reason": "invalid"}
        code_row = rows[0]
        if code_row.get("used_at"):
            return {"ok": False, "reason": "used"}

        expires_at = code_row.get("expires_at")
        if expires_at:
            try:
                exp = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
                if exp.tzinfo is None:
                    exp = exp.replace(tzinfo=timezone.utc)
                if exp <= datetime.now(timezone.utc):
                    return {"ok": False, "reason": "expired"}
            except ValueError:
                return {"ok": False, "reason": "invalid"}

        web_users = self.client.table("users").select("*").eq("id", code_row["user_id"]).execute().data
        if not web_users:
            return {"ok": False, "reason": "invalid"}
        web_user = web_users[0]
        auth_user_id = web_user.get("auth_user_id")
        if not auth_user_id:
            return {"ok": False, "reason": "invalid"}

        self.client.table("link_codes").update(
            {"used_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", code_row["id"]).execute()

        bot_users = self.client.table("users").select("*").eq(field, value).execute().data
        bot_user = bot_users[0] if bot_users else None

        if bot_user and bot_user["id"] != web_user["id"]:
            subs = self.client.table("subscriptions").select("*").eq("user_id", web_user["id"]).execute().data
            for s in subs:
                self.client.table("subscriptions").upsert(
                    {"user_id": bot_user["id"], "topic_id": s["topic_id"]},
                    on_conflict="user_id,topic_id",
                ).execute()
            # 웹 placeholder를 먼저 삭제해야 auth_user_id unique 충돌을 피할 수 있음
            self.client.table("users").delete().eq("id", web_user["id"]).execute()
            self.client.table("users").update({"auth_user_id": auth_user_id}).eq("id", bot_user["id"]).execute()
            return {"ok": True, "user_id": bot_user["id"]}

        self.client.table("users").update({field: value}).eq("id", web_user["id"]).execute()
        return {"ok": True, "user_id": web_user["id"]}
