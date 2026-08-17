"""텔레그램 메시지 발송."""

import asyncio
import logging

from telegram import Bot

logger = logging.getLogger(__name__)


class TelegramNotifier:
    def __init__(self, token: str):
        self._token = token

    def send(self, chat_id: str, text: str, parse_mode: str | None = None) -> bool:
        async def _send() -> None:
            async with Bot(token=self._token) as bot:
                await bot.send_message(
                    chat_id=chat_id, text=text, parse_mode=parse_mode
                )

        try:
            asyncio.run(_send())
            return True
        except Exception as e:
            logger.error("텔레그램 발송 실패 chat_id=%s: %s", chat_id, e)
            return False
