import argparse
import html
import logging
import re
import sys
from datetime import datetime, time as dtime
from typing import Any, Dict, List, Tuple
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

from ai.deepseek import DeepSeekAdapter
from ai.failover import FailoverLLMAdapter
from ai.gemini import GeminiAdapter
from collectors.base import Article
from collectors.bing_rss import BingNewsRSSCollector
from collectors.google_rss import GoogleNewsRSSCollector
from config import settings
from db.supabase import SupabaseDB
from notifier.telegram import TelegramNotifier

KST = ZoneInfo("Asia/Seoul")
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)

logger = logging.getLogger("morning-brief")


def collect_articles(keyword: str) -> List[Article]:
    articles: List[Article] = []
    try:
        articles = GoogleNewsRSSCollector().collect(keyword)
        logger.info("Google RSS 수집 %s: %d건", keyword, len(articles))
    except Exception as e:
        logger.warning("Google RSS 수집 실패 %s: %s", keyword, e)
    if not articles:
        try:
            articles = BingNewsRSSCollector().collect(keyword)
            logger.info("Bing RSS fallback 수집 %s: %d건", keyword, len(articles))
        except Exception as e:
            logger.error("Bing RSS 수집 실패 %s: %s", keyword, e)
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


def dedup_articles(articles: List[Article], existing_urls: set) -> List[Article]:
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


def format_message(label: str, brief_date: str, summary: Dict[str, Any], articles: List[Dict[str, Any]]) -> str:
    esc = html.escape
    lines = [
        f"📰 [{esc(label)}] 아침 브리핑 ({esc(brief_date)})",
        esc(summary.get("title") or label),
    ]
    for s in summary.get("summary", []):
        lines.append(f"- {esc(s)}")
    if articles:
        links = []
        for a in articles[:3]:
            title = esc((a.get("title") or "기사")[:40])
            links.append(f'<a href="{esc(a["url"])}">{title}</a>')
        lines.append("출처: " + " | ".join(links))
    msg = "\n".join(lines)
    if len(msg) > 4096:
        msg = msg[:4090] + "..."
    return msg


def collect_topic_articles(topic: Dict[str, Any], db: SupabaseDB) -> Dict[str, Any]:
    topic_id = topic["id"]
    keyword = topic["keyword"]
    articles = collect_articles(keyword)
    if settings.require_all_keyword_tokens:
        before = len(articles)
        articles = [a for a in articles if is_relevant(a, keyword)]
        if len(articles) != before:
            logger.info("키워드 무관 기사 제외 %s: %d건", keyword, before - len(articles))
    if not articles:
        logger.info("수집 기사 없음: %s", keyword)
        return {"status": "no_articles"}
    existing = db.existing_urls([a.url for a in articles])
    articles = dedup_articles(articles, existing)
    if not articles:
        logger.info("신규 기사 없음(중복): %s", keyword)
        return {"status": "no_new_articles"}
    db.insert_articles([a.to_db(topic_id) for a in articles])
    return {"status": "collected", "count": len(articles)}


def process_user(
    user: Dict[str, Any],
    user_topics: List[Dict[str, Any]],
    brief_date,
    today_start: datetime,
    db: SupabaseDB,
    ai,
    notifier: TelegramNotifier,
    dry_run: bool,
) -> Dict[str, Any]:
    user_id = user["id"]
    brief_date_str = brief_date.isoformat()
    label = user_topics[0]["keyword"] + (f" 외 {len(user_topics) - 1}개" if len(user_topics) > 1 else "")
    keyword_hint = ", ".join(t["keyword"] for t in user_topics)

    briefing = db.get_briefing_for_user(user_id, brief_date_str)
    sources: List[Dict[str, Any]] = []

    if briefing is None:
        per_topic_limit = max(3, settings.max_candidates_per_topic // len(user_topics))
        candidates = db.get_user_candidate_articles([t["id"] for t in user_topics], today_start, per_topic_limit)
        if not candidates:
            logger.info("후보 기사 없음: user=%s", user["telegram_chat_id"])
            return {"status": "no_candidates"}
        selected = ai.select_diverse(keyword_hint, candidates, settings.max_articles_per_topic)
        if not selected:
            logger.info("선별 기사 없음: user=%s", user["telegram_chat_id"])
            return {"status": "no_selected"}
        logger.info("기사 선별 user=%s: %d건 -> %d건", user["telegram_chat_id"], len(candidates), len(selected))
        for p in selected:
            body = fetch_body(p["url"], p.get("snippet") or "")
            p["body"] = body
            db.update_article_body(p["id"], body)
        summary = ai.summarize(keyword_hint, selected)
        briefing = db.create_user_briefing(user_id, brief_date_str, summary)
        db.mark_articles_briefed([p["id"] for p in selected], briefing["id"])
        sources = selected
        logger.info("브리핑 생성 완료: user=%s (%s)", user["telegram_chat_id"], briefing["id"])
    else:
        sources = db.get_articles_for_briefing(briefing["id"])

    deliveries = db.get_deliveries(briefing["id"])
    sent_user_ids = {d["user_id"] for d in deliveries if d["status"] == "sent"}
    if user_id in sent_user_ids:
        return {"status": "already_sent"}

    msg = format_message(label, brief_date_str, briefing["summary"], sources)
    if dry_run:
        logger.info("[dry-run] 발송 대상 chat_id=%s:\n%s", user["telegram_chat_id"], msg)
        return {"status": "delivered", "sent": 1, "failed": 0}
    ok = notifier.send(user["telegram_chat_id"], msg, parse_mode="HTML")
    db.record_delivery(briefing["id"], user_id, "sent" if ok else "failed")
    return {"status": "delivered", "sent": 1 if ok else 0, "failed": 0 if ok else 1}


def build_ai_adapter() -> Any:
    summary_lines = settings.summary_lines
    deepseek = DeepSeekAdapter(
        settings.deepseek_api_key, settings.deepseek_base_url, settings.deepseek_model, summary_lines
    )
    gemini = None
    if settings.gemini_api_key:
        gemini = GeminiAdapter(
            settings.gemini_api_key, settings.gemini_base_url, settings.gemini_model, summary_lines
        )

    if settings.llm_provider.lower() == "gemini":
        if gemini is None:
            raise RuntimeError("LLM_PROVIDER=gemini 이지만 GEMINI_API_KEY가 설정되지 않았습니다")
        primary, secondary = gemini, deepseek
    else:
        primary, secondary = deepseek, gemini

    if secondary is None:
        return primary
    return FailoverLLMAdapter(primary, secondary, summary_lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="모닝브리프 백엔드 파이프라인")
    parser.add_argument("--dry-run", action="store_true", help="텔레그램 미발송, 콘솔 출력만")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    db = SupabaseDB(settings.supabase_url, settings.supabase_service_role_key)
    ai = build_ai_adapter()
    notifier = TelegramNotifier(settings.telegram_bot_token)

    brief_date = datetime.now(KST).date()
    today_start = datetime.combine(brief_date, dtime.min, tzinfo=KST)
    logger.info("시작: date=%s dry_run=%s", brief_date, args.dry_run)

    failures: List[Tuple[str, str]] = []
    total_sent = 0
    total_failed = 0

    topics = db.list_active_topics()
    for topic in topics:
        try:
            collect_topic_articles(topic, db)
        except Exception as e:
            logger.exception("토픽 수집 실패: %s", topic["keyword"])
            failures.append((f"수집:{topic['keyword']}", str(e)))

    users = db.list_subscribed_users()
    for user in users:
        try:
            user_topics = db.list_user_topics(user["id"])
            if not user_topics:
                continue
            result = process_user(user, user_topics, brief_date, today_start, db, ai, notifier, args.dry_run)
            total_sent += result.get("sent", 0)
            total_failed += result.get("failed", 0)
        except Exception as e:
            logger.exception("사용자 처리 실패: %s", user["telegram_chat_id"])
            failures.append((f"사용자:{user['telegram_chat_id']}", str(e)))

    logger.info(
        "종료: users=%d sent=%d failed=%d failures=%d",
        len(users), total_sent, total_failed, len(failures),
    )

    if failures and settings.admin_chat_id and not args.dry_run:
        msg = "모닝브리프 처리 실패:\n" + "\n".join(f"- {k}: {e}" for k, e in failures)
        notifier.send(settings.admin_chat_id, msg)

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
