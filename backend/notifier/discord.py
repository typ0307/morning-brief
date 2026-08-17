"""디스코드 DM 발송 (REST API)."""

import logging

import requests

logger = logging.getLogger(__name__)

API_BASE = "https://discord.com/api/v10"


class DiscordNotifier:
    def __init__(self, token: str):
        self._headers = {
            "Authorization": f"Bot {token}",
            "Content-Type": "application/json",
        }

    def send(self, user_id: str, text: str) -> bool:
        try:
            dm = requests.post(
                f"{API_BASE}/users/@me/channels",
                headers=self._headers,
                json={"recipient_id": str(user_id)},
                timeout=10,
            )
            if dm.status_code != 200:
                logger.error(
                    "디스코드 DM 채널 생성 실패 user_id=%s: %s",
                    user_id,
                    dm.text,
                )
                return False
            channel_id = dm.json()["id"]
            msg = requests.post(
                f"{API_BASE}/channels/{channel_id}/messages",
                headers=self._headers,
                json={"content": text[:2000]},
                timeout=10,
            )
            if msg.status_code != 200:
                logger.error(
                    "디스코드 메시지 발송 실패 user_id=%s: %s",
                    user_id,
                    msg.text,
                )
                return False
            return True
        except Exception as e:
            logger.error("디스코드 발송 실패 user_id=%s: %s", user_id, e)
            return False
