"""디스코드 봇.

슬래시 커맨드(/start, /subscribe, /unsubscribe, /list, /brief, /refresh)와
접두사 명령어(!start 등)를 함께 지원한다. DM에 연결 코드만 보내도 연결이 시도된다.
"""

import asyncio
import logging
import re
from datetime import datetime

import discord
from discord import app_commands
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
    "/start <코드> - 웹 설정에서 받은 코드로 계정 연결\n"
    "/subscribe <키워드> - 토픽 구독\n"
    "/unsubscribe <키워드> - 토픽 구독 취소\n"
    "/list - 내 구독 목록\n"
    "/brief <키워드> - 해당 키워드 바로 요약\n"
    "/refresh - (관리자) 파이프라인 즉시 실행\n"
    "DM에 연결 코드만 보내도 연결됩니다. (! 접두사 명령어도 동일하게 동작)"
)

intents = discord.Intents.default()
intents.message_content = True

bot = commands.Bot(command_prefix="!", intents=intents, help_command=None)


def _clean_keyword(args: str) -> str:
    return " ".join(args.split()).strip()


async def _reply(ctx: commands.Context, text: str) -> None:
    await ctx.send(text[:2000])


async def _link_user(user_id: str, code: str, send) -> None:
    db: SupabaseDB = bot.db
    result = await asyncio.to_thread(db.link_discord, code, user_id)
    if result.get("ok"):
        await send("디스코드 계정이 연결되었습니다. 이제 아침 브리핑을 받아볼 수 있습니다.")
    elif result.get("reason") == "expired":
        await send("연결 코드가 만료되었습니다. 웹 설정 페이지에서 새 코드를 발급받아 주세요.")
    elif result.get("reason") == "used":
        await send("이미 사용된 연결 코드입니다. 웹 설정 페이지에서 새 코드를 발급받아 주세요.")
    else:
        await send("유효하지 않은 연결 코드입니다.")


def _build_brief_message(keyword: str) -> str:
    ai = bot.ai
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


@bot.event
async def on_ready() -> None:
    logger.info("디스코드 봇 시작: %s", bot.user)
    await bot.tree.sync()
    for guild in bot.guilds:
        try:
            await bot.tree.sync(guild=guild)
        except discord.HTTPException as e:
            logger.warning("길드 슬래시 커맨드 동기화 실패 guild_id=%s: %s", guild.id, e)
    logger.info("슬래시 커맨드 동기화 완료")


@bot.event
async def on_message(message: discord.Message) -> None:
    if message.author.bot:
        return
    # DM에 연결 코드만 보내면 연결 시도 (prefix 없이)
    if message.guild is None and CODE_RE.match(message.content.strip()):
        ctx = await bot.get_context(message)
        await _link_user(str(ctx.author.id), message.content.strip(), lambda t: _reply(ctx, t))
        return
    await bot.process_commands(message)


# ---------- 접두사(!) 명령어 ----------


@bot.command()
async def start(ctx: commands.Context, code: str | None = None) -> None:
    if not code:
        await _reply(ctx, "사용법: !start <연결 코드> (웹 설정 페이지에서 발급)")
        return
    await _link_user(str(ctx.author.id), code.strip(), lambda t: _reply(ctx, t))


@bot.command(name="help")
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


@bot.command(name="list")
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
    keyword = _clean_keyword(args)
    if not keyword:
        await _reply(ctx, "사용법: !brief <키워드>")
        return
    await _reply(ctx, f"'{keyword}' 요약을 생성하고 있습니다...")
    try:
        msg = await asyncio.to_thread(_build_brief_message, keyword)
        await _reply(ctx, msg)
    except Exception as e:
        logger.exception("brief 실패: %s", keyword)
        await _reply(ctx, f"요약 생성에 실패했습니다: {e}")


@bot.command()
async def refresh(ctx: commands.Context, *, args: str = "") -> None:
    if settings.admin_discord_user_id != str(ctx.author.id):
        logger.warning("비관리자의 refresh 시도: user_id=%s", ctx.author.id)
        await _reply(ctx, "관리자 전용 명령어입니다.")
        return
    keyword = _clean_keyword(args)
    target = f" ({keyword})" if keyword else ""
    await _reply(ctx, f"갱신 실행 시작{target}...")
    try:
        msg = await asyncio.to_thread(_run_pipeline_message, keyword or None)
        await _reply(ctx, msg)
    except Exception as e:
        logger.exception("refresh 실패")
        await _reply(ctx, f"갱신에 실패했습니다: {e}")


# ---------- 슬래시(/) 커맨드 ----------


@bot.tree.command(name="start", description="웹 설정에서 받은 연결 코드로 계정 연결")
@app_commands.describe(code="웹 설정 페이지에서 발급받은 8자리 코드")
async def slash_start(interaction: discord.Interaction, code: str) -> None:
    await _link_user(str(interaction.user.id), code.strip(), lambda t: interaction.response.send_message(t))


@bot.tree.command(name="help", description="도움말")
async def slash_help(interaction: discord.Interaction) -> None:
    await interaction.response.send_message(HELP_TEXT)


@bot.tree.command(name="subscribe", description="토픽 구독")
@app_commands.describe(keyword="구독할 키워드")
async def slash_subscribe(interaction: discord.Interaction, keyword: str) -> None:
    keyword = _clean_keyword(keyword)
    if not keyword:
        await interaction.response.send_message("사용법: /subscribe <키워드>", ephemeral=True)
        return
    db: SupabaseDB = bot.db
    user = await asyncio.to_thread(db.upsert_discord_user, str(interaction.user.id))
    topic = await asyncio.to_thread(db.upsert_topic, keyword)
    await asyncio.to_thread(db.subscribe, user["id"], topic["id"])
    await interaction.response.send_message(f"구독 완료: {topic['keyword']}")


@bot.tree.command(name="unsubscribe", description="토픽 구독 취소")
@app_commands.describe(keyword="구독 해지할 키워드")
async def slash_unsubscribe(interaction: discord.Interaction, keyword: str) -> None:
    keyword = _clean_keyword(keyword)
    if not keyword:
        await interaction.response.send_message("사용법: /unsubscribe <키워드>", ephemeral=True)
        return
    db: SupabaseDB = bot.db
    user = await asyncio.to_thread(db.upsert_discord_user, str(interaction.user.id))
    topic = await asyncio.to_thread(db.get_topic_by_keyword, keyword)
    if topic is None:
        await interaction.response.send_message(f"토픽이 없습니다: {keyword}", ephemeral=True)
        return
    await asyncio.to_thread(db.unsubscribe, user["id"], topic["id"])
    await interaction.response.send_message(f"구독 취소: {topic['keyword']}")


@bot.tree.command(name="list", description="내 구독 목록")
async def slash_list(interaction: discord.Interaction) -> None:
    db: SupabaseDB = bot.db
    user = await asyncio.to_thread(db.upsert_discord_user, str(interaction.user.id))
    topics = await asyncio.to_thread(db.list_subscriptions, user["id"])
    if not topics:
        await interaction.response.send_message("구독 중인 토픽이 없습니다.")
        return
    lines = "\n".join(f"- {t['keyword']}" for t in topics)
    await interaction.response.send_message("구독 목록:\n" + lines)


@bot.tree.command(name="brief", description="해당 키워드 바로 요약")
@app_commands.describe(keyword="요약할 키워드")
async def slash_brief(interaction: discord.Interaction, keyword: str) -> None:
    keyword = _clean_keyword(keyword)
    if not keyword:
        await interaction.response.send_message("사용법: /brief <키워드>", ephemeral=True)
        return
    await interaction.response.defer()
    try:
        msg = await asyncio.to_thread(_build_brief_message, keyword)
        await interaction.followup.send(msg)
    except Exception as e:
        logger.exception("brief 실패: %s", keyword)
        await interaction.followup.send(f"요약 생성에 실패했습니다: {e}")


@bot.tree.command(name="refresh", description="파이프라인 즉시 실행 (관리자 전용)")
@app_commands.describe(keyword="특정 키워드만 갱신 (선택)")
async def slash_refresh(interaction: discord.Interaction, keyword: str | None = None) -> None:
    if settings.admin_discord_user_id != str(interaction.user.id):
        logger.warning("비관리자의 refresh 시도: user_id=%s", interaction.user.id)
        await interaction.response.send_message("관리자 전용 명령어입니다.", ephemeral=True)
        return
    await interaction.response.defer()
    try:
        msg = await asyncio.to_thread(_run_pipeline_message, keyword or None)
        await interaction.followup.send(msg)
    except Exception as e:
        logger.exception("refresh 실패")
        await interaction.followup.send(f"갱신에 실패했습니다: {e}")


def _run_pipeline_message(keyword: str | None) -> str:
    db: SupabaseDB = bot.db
    ai = bot.ai
    notifier = TelegramNotifier(settings.telegram_bot_token)
    discord_notifier = DiscordNotifier(settings.discord_bot_token) if settings.discord_bot_token else None
    brief_date = datetime.now(KST).date()
    summary = run_pipeline(db, ai, notifier, discord_notifier, brief_date, keyword, False)
    if not summary["topics"]:
        if keyword:
            return f"'{keyword}' 토픽을 찾을 수 없습니다. (구독된 토픽만 갱신)"
        return "구독된 토픽이 없습니다."
    msg = f"갱신 완료: 토픽 {summary['topics']}개, 발송 {summary['sent']}건, 실패 {summary['failed']}건"
    if summary["failures"]:
        msg += "\n실패: " + ", ".join(f"{k}: {e}" for k, e in summary["failures"])
    return msg


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
