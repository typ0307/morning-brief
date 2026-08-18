"""사용자별 발송 일정 스케줄러.

매분 정각에 `run_scheduled`를 실행해 due 사용자에게만 브리핑을 발송한다.
상시 루프가 기본이며 `--once`로 1회 실행 후 종료할 수 있다.
"""

import argparse
import logging
import sys
import time
from datetime import datetime

from ai.openai_compat import OpenAICompatAdapter
from config import settings
from db.supabase import SupabaseDB
from main import KST, build_llm, run_scheduled
from notifier.discord import DiscordNotifier
from notifier.telegram import TelegramNotifier

logger = logging.getLogger("morning-brief-scheduler")


def _build_parts() -> tuple[SupabaseDB, OpenAICompatAdapter, TelegramNotifier, DiscordNotifier | None]:
    db = SupabaseDB(settings.supabase_url, settings.supabase_service_role_key)
    ai = build_llm()
    notifier = TelegramNotifier(settings.telegram_bot_token)
    discord_notifier = DiscordNotifier(settings.discord_bot_token) if settings.discord_bot_token else None
    return db, ai, notifier, discord_notifier


def run_once(dry_run: bool) -> int:
    db, ai, notifier, discord_notifier = _build_parts()
    now = datetime.now(KST)
    logger.info("틱 시작: now=%s dry_run=%s", now.isoformat(), dry_run)

    summary = run_scheduled(db, ai, notifier, discord_notifier, now, dry_run=dry_run)

    logger.info(
        "틱 종료: slots=%d topics=%d sent=%d failed=%d failures=%d",
        summary["slots"], summary["topics"], summary["sent"], summary["failed"], len(summary["failures"]),
    )
    return 1 if summary["failures"] else 0


def run_loop(dry_run: bool) -> None:
    logger.info("스케줄러 시작 (매분 실행, Ctrl-C로 종료)")
    while True:
        try:
            run_once(dry_run)
        except KeyboardInterrupt:
            raise
        except Exception:
            logger.exception("틱 처리 실패 (다음 틱에서 재시도)")
        time.sleep(max(1, 60 - datetime.now(KST).second))


def main() -> int:
    parser = argparse.ArgumentParser(description="모닝브리프 발송 일정 스케줄러")
    parser.add_argument("--once", action="store_true", help="1회 실행 후 종료")
    parser.add_argument("--dry-run", action="store_true", help="발송 없이 로그만")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    if args.once:
        return run_once(args.dry_run)

    try:
        run_loop(args.dry_run)
    except KeyboardInterrupt:
        logger.info("종료 요청으로 스케줄러를 종료합니다")
    return 0


if __name__ == "__main__":
    sys.exit(main())
