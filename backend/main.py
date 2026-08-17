import argparse
import html
import logging
import re
import sys
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

from ai.openai_compat import OpenAICompatAdapter
from collectors.base import Article
from collectors.naver_news import NaverNewsCollector
from config import settings
from db.supabase import SupabaseDB
from notifier.telegram import TelegramNotifier

KST = ZoneInfo("Asia/Seoul")
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)

logger = logging.getLogger("morning-brief")


def filter_recent(articles: list[Article], max_age_hours: int) -> list[Article]:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
    result = []
    for a in articles:
        if a.published_at is None:
            continue
        dt = a.published_at
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        if dt.astimezone(timezone.utc) >= cutoff:
            result.append(a)
    return result


def collect_articles(keyword: str) -> list[Article]:
    if not (settings.naver_client_id and settings.naver_client_secret):
        logger.error("네이버 API 키가 설정되지 않았습니다")
        return []
    try:
        articles = NaverNewsCollector(
            settings.naver_client_id, settings.naver_client_secret
        ).collect(keyword)
        logger.info("Naver 수집 %s: %d건", keyword, len(articles))
    except Exception as e:
        logger.error("Naver 수집 실패 %s: %s", keyword, e)
        return []
    if articles and settings.max_article_age_hours > 0:
        before = len(articles)
        articles = filter_recent(articles, settings.max_article_age_hours)
        if len(articles) != before:
            logger.info(
                "오래된 기사 제외 %s: %d건", keyword, before - len(articles)
            )
    return articles


def fetch_body(url: str, snippet: str) -> str:
    try:
        resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.content, "html.parser")
        for tag in soup(["script", "style", "noscript", "nav", "footer", "header", "aside", "form", "iframe"]):
            tag.decompose()
        text = soup.get_text(separator="\n", strip=True)
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n+", "\n", text).strip()
        if len(text) >= 200:
            return text[:8000]
    except Exception as e:
        logger.debug("원문 추출 실패 %s: %s", url, e)
    return snippet or ""


def dedup_articles(articles: list[Article], existing_urls: set) -> list[Article]:
    seen = set()
    result = []
    for a in articles:
        if a.url in seen or a.url in existing_urls:
            continue
        seen.add(a.url)
        result.append(a)
    return result


def is_relevant(article: Article, keyword: str) -> bool:
    tokens = keyword.split()
    if not tokens:
        return True
    text = f"{article.title} {re.sub(r'<[^>]+>', ' ', article.snippet)}".lower()
    return all(t.lower() in text for t in tokens)


def format_message(keyword: str, brief_date: str, summary: dict[str, Any], articles: list[dict[str, Any]]) -> str:
    esc = html.escape
    lines = [
        f"📰 [{esc(keyword)}] 아침 브리핑 ({esc(brief_date)})",
        esc(summary.get("title") or keyword),
    ]
    for s in summary.get("summary", []):
        if str(s).strip():
            lines.append(f"- {esc(s)}")

    limit = 4096
    msg = "\n".join(lines)
    if len(msg) > limit:
        return msg[: limit - 3] + "..."

    if not articles:
        return msg

    links = []
    for a in articles[:5]:
        title = esc((a.get("title") or "기사")[:40])
        links.append(f'<a href="{esc(a["url"])}">{title}</a>')

    for n in range(len(links), 0, -1):
        candidate = msg + "\n출처: " + " | ".join(links[:n])
        if len(candidate) <= limit:
            return candidate
    return msg


def process_topic(
    topic: dict[str, Any],
    brief_date,
    db: SupabaseDB,
    ai: OpenAICompatAdapter,
    notifier: TelegramNotifier,
    dry_run: bool,
) -> dict[str, Any]:
    topic_id = topic["id"]
    keyword = topic["keyword"]
    brief_date_str = brief_date.isoformat()

    briefing = db.get_briefing(topic_id, brief_date_str)
    sources: list[dict[str, Any]] = []

    if briefing is None:
        articles = collect_articles(keyword)
        if settings.require_all_keyword_tokens:
            before = len(articles)
            articles = [a for a in articles if is_relevant(a, keyword)]
            if len(articles) != before:
                logger.info("키워드 무관 기사 제외 %s: %d건", keyword, before - len(articles))
        if not articles:
            logger.info("수집 기사 없음: %s", keyword)
            return {"status": "no_articles"}
        existing = db.existing_urls(topic_id, [a.url for a in articles])
        articles = dedup_articles(articles, existing)
        if not articles:
            logger.info("신규 기사 없음(중복): %s", keyword)
            return {"status": "no_new_articles"}
        db.insert_articles([a.to_db(topic_id) for a in articles])
        candidates = db.get_pending_articles(topic_id, settings.max_candidates_per_topic)
        if not candidates:
            logger.info("대상 기사 없음: %s", keyword)
            return {"status": "no_pending"}
        selected = ai.select_diverse(keyword, candidates, settings.max_articles_per_topic)
        if not selected:
            logger.info("선별 기사 없음: %s", keyword)
            return {"status": "no_pending"}
        logger.info("기사 선별 %s: %d건 -> %d건", keyword, len(candidates), len(selected))
        for p in selected:
            body = fetch_body(p["url"], p.get("snippet") or "")
            p["body"] = body
            db.update_article_body(p["id"], body)
        summary = ai.summarize(keyword, selected)
        briefing = db.create_briefing(topic_id, brief_date_str, summary)
        db.mark_articles_briefed([p["id"] for p in selected], briefing["id"])
        sources = selected
        logger.info("브리핑 생성 완료: %s (%s)", keyword, briefing["id"])
    else:
        sources = db.get_articles_for_briefing(briefing["id"])

    subscribers = db.list_subscribers(topic_id)
    if not subscribers:
        logger.info("구독자 없음: %s", keyword)
        return {"status": "no_subscribers"}

    deliveries = db.get_deliveries(briefing["id"])
    sent_user_ids = {d["user_id"] for d in deliveries if d["status"] == "sent"}
    msg = format_message(keyword, brief_date_str, briefing["summary"], sources)

    sent = 0
    failed = 0
    for sub in subscribers:
        if sub["id"] in sent_user_ids:
            continue
        if not sub.get("telegram_chat_id"):
            logger.info("텔레그램 미연결 구독자 건너뜀: user_id=%s", sub["id"])
            continue
        if dry_run:
            logger.info("[dry-run] 발송 대상 chat_id=%s:\n%s", sub["telegram_chat_id"], msg)
            sent += 1
            continue
        ok = notifier.send(sub["telegram_chat_id"], msg, parse_mode="HTML")
        db.record_delivery(briefing["id"], sub["id"], "sent" if ok else "failed")
        if ok:
            sent += 1
        else:
            failed += 1

    return {"status": "delivered", "sent": sent, "failed": failed}


def build_llm() -> OpenAICompatAdapter:
    if settings.llm_provider == "openrouter":
        if not settings.openrouter_api_key:
            logger.error("LLM_PROVIDER=openrouter 이지만 OPENROUTER_API_KEY가 설정되지 않았습니다")
            raise SystemExit(1)
        return OpenAICompatAdapter(
            settings.openrouter_api_key,
            "https://openrouter.ai/api/v1",
            settings.openrouter_model,
            settings.summary_lines,
        )
    if not settings.deepseek_api_key:
        logger.error("LLM_PROVIDER=deepseek 이지만 DEEPSEEK_API_KEY가 설정되지 않았습니다")
        raise SystemExit(1)
    return OpenAICompatAdapter(
        settings.deepseek_api_key, settings.deepseek_base_url, settings.deepseek_model, settings.summary_lines
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="모닝브리프 백엔드 파이프라인")
    parser.add_argument("--dry-run", action="store_true", help="텔레그램 미발송, 콘솔 출력만")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    db = SupabaseDB(settings.supabase_url, settings.supabase_service_role_key)
    ai = build_llm()
    notifier = TelegramNotifier(settings.telegram_bot_token)

    brief_date = datetime.now(KST).date()
    logger.info("시작: date=%s dry_run=%s", brief_date, args.dry_run)

    topics = db.list_active_topics()
    if not topics:
        logger.info("활성 토픽 없음")
        return 0

    failures: list[tuple[str, str]] = []
    total_sent = 0
    total_failed = 0

    for topic in topics:
        try:
            result = process_topic(topic, brief_date, db, ai, notifier, args.dry_run)
            total_sent += result.get("sent", 0)
            total_failed += result.get("failed", 0)
        except Exception as e:
            logger.exception("토픽 처리 실패: %s", topic["keyword"])
            failures.append((topic["keyword"], str(e)))

    logger.info(
        "종료: topics=%d sent=%d failed=%d failures=%d",
        len(topics), total_sent, total_failed, len(failures),
    )

    if failures and settings.admin_chat_id and not args.dry_run:
        msg = "모닝브리프 토픽 처리 실패:\n" + "\n".join(f"- {k}: {e}" for k, e in failures)
        notifier.send(settings.admin_chat_id, msg)

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
