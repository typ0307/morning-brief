import asyncio
import logging
from datetime import datetime

from telegram import BotCommand, Update
from telegram.ext import Application, CommandHandler, ContextTypes

from config import settings
from db.supabase import SupabaseDB
from main import (
    KST,
    build_llm,
    collect_articles,
    fetch_body,
    format_message,
    is_relevant,
)

logger = logging.getLogger("morning-brief-bot")

HELP_TEXT = (
    "모닝브리프 봇 사용법\n"
    "/subscribe <키워드> - 토픽 구독\n"
    "/unsubscribe <키워드> - 토픽 구독 취소\n"
    "/list - 내 구독 목록\n"
    "/brief <키워드> - 해당 키워드 바로 요약"
)


def _clean_keyword(args: list[str]) -> str:
    return " ".join(args).strip()


async def _reply(update: Update, text: str, parse_mode: str | None = None) -> None:
    if update.effective_message is not None:
        await update.effective_message.reply_text(text, parse_mode=parse_mode)


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    db: SupabaseDB = context.bot_data["db"]
    if not context.args:
        await _reply(update, HELP_TEXT)
        return
    code = context.args[0].strip()
    chat_id = str(update.effective_chat.id)
    result = await asyncio.to_thread(db.link_telegram, code, chat_id)
    if result.get("ok"):
        await _reply(update, "텔레그램 계정이 연결되었습니다. 이제 아침 브리핑을 받아볼 수 있습니다.")
    elif result.get("reason") == "expired":
        await _reply(update, "연결 코드가 만료되었습니다. 웹 설정 페이지에서 새 코드를 발급받아 주세요.")
    elif result.get("reason") == "used":
        await _reply(update, "이미 사용된 연결 코드입니다. 웹 설정 페이지에서 새 코드를 발급받아 주세요.")
    else:
        await _reply(update, "유효하지 않은 연결 코드입니다.")


async def help_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await _reply(update, HELP_TEXT)


async def subscribe(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    db: SupabaseDB = context.bot_data["db"]
    keyword = _clean_keyword(context.args)
    if not keyword:
        await _reply(update, "사용법: /subscribe <키워드>")
        return
    user = await asyncio.to_thread(db.upsert_user, str(update.effective_chat.id))
    topic = await asyncio.to_thread(db.upsert_topic, keyword)
    await asyncio.to_thread(db.subscribe, user["id"], topic["id"])
    await _reply(update, f"구독 완료: {topic['keyword']}")


async def unsubscribe(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    db: SupabaseDB = context.bot_data["db"]
    keyword = _clean_keyword(context.args)
    if not keyword:
        await _reply(update, "사용법: /unsubscribe <키워드>")
        return
    user = await asyncio.to_thread(db.upsert_user, str(update.effective_chat.id))
    topic = await asyncio.to_thread(db.get_topic_by_keyword, keyword)
    if topic is None:
        await _reply(update, f"토픽이 없습니다: {keyword}")
        return
    await asyncio.to_thread(db.unsubscribe, user["id"], topic["id"])
    await _reply(update, f"구독 취소: {topic['keyword']}")


async def list_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    db: SupabaseDB = context.bot_data["db"]
    user = await asyncio.to_thread(db.upsert_user, str(update.effective_chat.id))
    topics = await asyncio.to_thread(db.list_subscriptions, user["id"])
    if not topics:
        await _reply(update, "구독 중인 토픽이 없습니다.")
        return
    lines = "\n".join(f"- {t['keyword']}" for t in topics)
    await _reply(update, "구독 목록:\n" + lines)


async def brief(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    ai = context.bot_data["ai"]
    keyword = _clean_keyword(context.args)
    if not keyword:
        await _reply(update, "사용법: /brief <키워드>")
        return
    await _reply(update, f"'{keyword}' 요약을 생성하고 있습니다...")

    def _run() -> tuple[str, bool]:
        articles = collect_articles(keyword)
        if settings.require_all_keyword_tokens:
            articles = [a for a in articles if is_relevant(a, keyword)]
        if not articles:
            return f"최근 기사가 없습니다: {keyword}", False
        dicts = [
            {"title": a.title, "url": a.url, "snippet": a.snippet, "body": a.body}
            for a in articles
        ]
        selected = ai.select_diverse(keyword, dicts, settings.max_articles_per_topic)
        if not selected:
            return f"선별 가능한 기사가 없습니다: {keyword}", False
        for p in selected:
            p["body"] = fetch_body(p["url"], p.get("snippet") or "")
        summary = ai.summarize(keyword, selected)
        brief_date = datetime.now(KST).date().isoformat()
        return format_message(keyword, brief_date, summary, selected), True

    try:
        msg, use_html = await asyncio.to_thread(_run)
        await _reply(update, msg, parse_mode="HTML" if use_html else None)
    except Exception as e:
        logger.exception("brief 실패: %s", keyword)
        await _reply(update, f"요약 생성에 실패했습니다: {e}")


async def post_init(application: Application) -> None:
    commands = [
        BotCommand("subscribe", "토픽 구독"),
        BotCommand("unsubscribe", "토픽 구독 취소"),
        BotCommand("list", "내 구독 목록"),
        BotCommand("brief", "바로 요약"),
    ]
    await application.bot.set_my_commands(commands)


def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )

    db = SupabaseDB(settings.supabase_url, settings.supabase_service_role_key)
    ai = build_llm()
    app = (
        Application.builder()
        .token(settings.telegram_bot_token)
        .post_init(post_init)
        .build()
    )
    app.bot_data["db"] = db
    app.bot_data["ai"] = ai

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_cmd))
    app.add_handler(CommandHandler("subscribe", subscribe))
    app.add_handler(CommandHandler("unsubscribe", unsubscribe))
    app.add_handler(CommandHandler("list", list_cmd))
    app.add_handler(CommandHandler("brief", brief))

    logger.info("봇 시작")
    app.run_polling()


if __name__ == "__main__":
    main()
