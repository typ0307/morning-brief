"""디스코드 봇.

웹 계정 연결(코드 입력), 구독 관리(!subscribe, !unsubscribe, !list),
즉석 요약(!brief)을 처리한다. DM에 연결 코드만 보내도 연결이 시도된다.
"""

import asyncio
import logging
import re
from datetime import datetime

import discord
from discord.ext import commands

from config import settings
from db.supabase import SupabaseDB
from main import (
    KST,
    build_llm,
    collect_articles,
    fetch_body,
    format_discord_message,
    is_relevant,
    run_pipeline,
)
from notifier.discord import DiscordNotifier
from notifier.telegram import TelegramNotifier

logger = logging.getLogger("morning-brief-discord-bot")

CODE_RE = re.compile(r"^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$")

HELP_TEXT = (
    "모닝브리프 봇 사용법\n"
    "!start <코드> - 웹 설정에서 받은 코드로 계정 연결\n"
    "!subscribe <키워드> - 토픽 구독\n"
    "!unsubscribe <키워드> - 토픽 구독 취소\n"
    "!list - 내 구독 목록\n"
    "!brief <키워드> - 해당 키워드 바로 요약\n"
    "DM에 연결 코드만 보내도 연결됩니다."
)

intents = discord.Intents.default()
intents.message_content = True

bot = commands.Bot(command_prefix="!", intents=intents, help_command=None)


def _clean_keyword(args: str) -> str:
    return " ".join(args.split()).strip()


async def _reply(ctx: commands.Context, text: str) -> None:
    await ctx.send(text[:2000])


async def _link(ctx: commands.Context, code: str) -> None:
    db: SupabaseDB = bot.db
    result = await asyncio.to_thread(db.link_discord, code, str(ctx.author.id))
    if result.get("ok"):
        await _reply(ctx, "디스코드 계정이 연결되었습니다. 이제 아침 브리핑을 받아볼 수 있습니다.")
    elif result.get("reason") == "expired":
        await _reply(ctx, "연결 코드가 만료되었습니다. 웹 설정 페이지에서 새 코드를 발급받아 주세요.")
    elif result.get("reason") == "used":
        await _reply(ctx, "이미 사용된 연결 코드입니다. 웹 설정 페이지에서 새 코드를 발급받아 주세요.")
    else:
        await _reply(ctx, "유효하지 않은 연결 코드입니다.")


@bot.event
async def on_ready() -> None:
    logger.info("디스코드 봇 시작: %s", bot.user)


@bot.event
async def on_message(message: discord.Message) -> None:
    if message.author.bot:
        return
    # DM에 연결 코드만 보내면 연결 시도 (prefix 없이)
    if message.guild is None and CODE_RE.match(message.content.strip()):
        ctx = await bot.get_context(message)
        await _link(ctx, message.content.strip())
        return
    await bot.process_commands(message)


@bot.command()
async def start(ctx: commands.Context, code: str | None = None) -> None:
    if not code:
        await _reply(ctx, "사용법: !start <연결 코드> (웹 설정 페이지에서 발급)")
        return
    await _link(ctx, code.strip())


@bot.command()
async def help_cmd(ctx: commands.Context) -> None:
    await _reply(ctx, HELP_TEXT)


@bot.command()
async def subscribe(ctx: commands.Context, *, args: str = "") -> None:
    keyword = _clean_keyword(args)
    if not keyword:
        await _reply(ctx, "사용법: !subscribe <키워드>")
        return
    db: SupabaseDB = bot.db
    user = await asyncio.to_thread(db.upsert_discord_user, str(ctx.author.id))
    topic = await asyncio.to_thread(db.upsert_topic, keyword)
    await asyncio.to_thread(db.subscribe, user["id"], topic["id"])
    await _reply(ctx, f"구독 완료: {topic['keyword']}")


@bot.command()
async def unsubscribe(ctx: commands.Context, *, args: str = "") -> None:
    keyword = _clean_keyword(args)
    if not keyword:
        await _reply(ctx, "사용법: !unsubscribe <키워드>")
        return
    db: SupabaseDB = bot.db
    user = await asyncio.to_thread(db.upsert_discord_user, str(ctx.author.id))
    topic = await asyncio.to_thread(db.get_topic_by_keyword, keyword)
    if topic is None:
        await _reply(ctx, f"토픽이 없습니다: {keyword}")
        return
    await asyncio.to_thread(db.unsubscribe, user["id"], topic["id"])
    await _reply(ctx, f"구독 취소: {topic['keyword']}")


@bot.command()
async def list_cmd(ctx: commands.Context) -> None:
    db: SupabaseDB = bot.db
    user = await asyncio.to_thread(db.upsert_discord_user, str(ctx.author.id))
    topics = await asyncio.to_thread(db.list_subscriptions, user["id"])
    if not topics:
        await _reply(ctx, "구독 중인 토픽이 없습니다.")
        return
    lines = "\n".join(f"- {t['keyword']}" for t in topics)
    await _reply(ctx, "구독 목록:\n" + lines)


@bot.command()
async def brief(ctx: commands.Context, *, args: str = "") -> None:
    ai = bot.ai
    keyword = _clean_keyword(args)
    if not keyword:
        await _reply(ctx, "사용법: !brief <키워드>")
        return
    await _reply(ctx, f"'{keyword}' 요약을 생성하고 있습니다...")

    def _run() -> str:
        articles = collect_articles(keyword)
        if settings.require_all_keyword_tokens:
            articles = [a for a in articles if is_relevant(a, keyword)]
        if not articles:
            return f"최근 기사가 없습니다: {keyword}"
        dicts = [
            {"title": a.title, "url": a.url, "snippet": a.snippet, "body": a.body}
            for a in articles
        ]
        selected = ai.select_diverse(keyword, dicts, settings.max_articles_per_topic)
        if not selected:
            return f"선별 가능한 기사가 없습니다: {keyword}"
        for p in selected:
            p["body"] = fetch_body(p["url"], p.get("snippet") or "")
        summary = ai.summarize(keyword, selected)
        brief_date = datetime.now(KST).date().isoformat()
        return format_discord_message(keyword, brief_date, summary, selected)

    try:
        msg = await asyncio.to_thread(_run)
        await _reply(ctx, msg)
    except Exception as e:
        logger.exception("brief 실패: %s", keyword)
        await _reply(ctx, f"요약 생성에 실패했습니다: {e}")


@bot.command()
async def refresh(ctx: commands.Context, *, args: str = "") -> None:
    db: SupabaseDB = bot.db
    ai = bot.ai
    if settings.admin_discord_user_id != str(ctx.author.id):
        logger.warning("비관리자의 refresh 시도: user_id=%s", ctx.author.id)
        await _reply(ctx, "관리자 전용 명령어입니다.")
        return

    keyword = _clean_keyword(args)
    target = f" ({keyword})" if keyword else ""
    await _reply(ctx, f"갱신 실행 시작{target}...")
    notifier = TelegramNotifier(settings.telegram_bot_token)
    discord_notifier = DiscordNotifier(settings.discord_bot_token) if settings.discord_bot_token else None
    brief_date = datetime.now(KST).date()

    try:
        summary = await asyncio.to_thread(
            run_pipeline, db, ai, notifier, discord_notifier, brief_date, keyword or None, False
        )
    except Exception as e:
        logger.exception("refresh 실패")
        await _reply(ctx, f"갱신에 실패했습니다: {e}")
        return

    if not summary["topics"]:
        if keyword:
            await _reply(ctx, f"'{keyword}' 토픽을 찾을 수 없습니다. (구독된 토픽만 갱신)")
        else:
            await _reply(ctx, "구독된 토픽이 없습니다.")
        return

    msg = f"갱신 완료: 토픽 {summary['topics']}개, 발송 {summary['sent']}건, 실패 {summary['failed']}건"
    if summary["failures"]:
        msg += "\n실패: " + ", ".join(f"{k}: {e}" for k, e in summary["failures"])
    await _reply(ctx, msg)


def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )

    if not settings.discord_bot_token:
        logger.error("DISCORD_BOT_TOKEN이 설정되지 않았습니다")
        raise SystemExit(1)

    db = SupabaseDB(settings.supabase_url, settings.supabase_service_role_key)
    ai = build_llm()
    bot.db = db
    bot.ai = ai

    logger.info("봇 시작")
    bot.run(settings.discord_bot_token)


if __name__ == "__main__":
    main()
