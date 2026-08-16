import logging

from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes

from config import settings
from db.supabase import SupabaseDB

logger = logging.getLogger("morning-brief-bot")

HELP_TEXT = (
    "모닝브리프 봇 사용법\n"
    "/subscribe <키워드> - 토픽 구독\n"
    "/unsubscribe <키워드> - 토픽 구독 취소\n"
    "/list - 내 구독 목록"
)


def _clean_keyword(args: list[str]) -> str:
    return " ".join(args).strip()


async def _reply(update: Update, text: str) -> None:
    if update.effective_message is not None:
        await update.effective_message.reply_text(text)


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await _reply(update, HELP_TEXT)


async def help_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await _reply(update, HELP_TEXT)


async def subscribe(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    db: SupabaseDB = context.bot_data["db"]
    keyword = _clean_keyword(context.args)
    if not keyword:
        await _reply(update, "사용법: /subscribe <키워드>")
        return
    user = db.upsert_user(str(update.effective_chat.id))
    topic = db.upsert_topic(keyword)
    db.subscribe(user["id"], topic["id"])
    await _reply(update, f"구독 완료: {topic['keyword']}")


async def unsubscribe(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    db: SupabaseDB = context.bot_data["db"]
    keyword = _clean_keyword(context.args)
    if not keyword:
        await _reply(update, "사용법: /unsubscribe <키워드>")
        return
    user = db.upsert_user(str(update.effective_chat.id))
    topic = db.get_topic_by_keyword(keyword)
    if topic is None:
        await _reply(update, f"토픽이 없습니다: {keyword}")
        return
    db.unsubscribe(user["id"], topic["id"])
    await _reply(update, f"구독 취소: {topic['keyword']}")


async def list_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    db: SupabaseDB = context.bot_data["db"]
    user = db.upsert_user(str(update.effective_chat.id))
    topics = db.list_subscriptions(user["id"])
    if not topics:
        await _reply(update, "구독 중인 토픽이 없습니다.")
        return
    lines = "\n".join(f"- {t['keyword']}" for t in topics)
    await _reply(update, "구독 목록:\n" + lines)


def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )

    db = SupabaseDB(settings.supabase_url, settings.supabase_service_role_key)
    app = Application.builder().token(settings.telegram_bot_token).build()
    app.bot_data["db"] = db

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_cmd))
    app.add_handler(CommandHandler("subscribe", subscribe))
    app.add_handler(CommandHandler("unsubscribe", unsubscribe))
    app.add_handler(CommandHandler("list", list_cmd))

    logger.info("봇 시작")
    app.run_polling()


if __name__ == "__main__":
    main()
