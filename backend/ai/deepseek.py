import logging
import time
from typing import Any

from openai import OpenAI

from .base import LLMAdapter
from .prompts import (
    SELECT_SYSTEM_PROMPT,
    SUMMARY_SYSTEM_PROMPT,
    build_article_content,
    build_selection_content,
    fallback_summary,
    parse_selection,
    parse_summary,
)

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 3


class DeepSeekAdapter(LLMAdapter):
    def __init__(self, api_key: str, base_url: str, model: str, summary_lines: int = 5):
        self.model = model
        self.summary_lines = summary_lines
        self.client = OpenAI(api_key=api_key, base_url=base_url)

    def _call(self, messages: list[dict[str, str]]):
        return self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            response_format={"type": "json_object"},
        )

    def select_diverse(
        self, keyword: str, articles: list[dict[str, Any]], k: int
    ) -> list[dict[str, Any]]:
        if len(articles) <= k:
            return list(articles)
        messages = [
            {"role": "system", "content": SELECT_SYSTEM_PROMPT.format(k=k)},
            {"role": "user", "content": build_selection_content(articles)},
        ]
        for attempt in range(MAX_ATTEMPTS):
            try:
                resp = self._call(messages)
                selected = parse_selection(resp.choices[0].message.content, articles, k)
                if selected:
                    return selected
            except Exception:
                pass
            if attempt < MAX_ATTEMPTS - 1:
                time.sleep(2 * (attempt + 1))
        return list(articles[:k])

    def summarize(self, keyword: str, articles: list[dict[str, Any]]) -> dict[str, Any]:
        messages = [
            {
                "role": "system",
                "content": SUMMARY_SYSTEM_PROMPT.format(n=self.summary_lines),
            },
            {"role": "user", "content": build_article_content(keyword, articles)},
        ]
        for attempt in range(MAX_ATTEMPTS):
            try:
                resp = self._call(messages)
                parsed = parse_summary(
                    resp.choices[0].message.content, self.summary_lines
                )
                if parsed is not None:
                    return parsed
            except Exception as e:
                logger.warning("DeepSeek 요약 시도 실패: %s", e)
            if attempt < MAX_ATTEMPTS - 1:
                time.sleep(2 * (attempt + 1))
        logger.warning("DeepSeek 요약 실패, 본문 텍스트 fallback 사용")
        return fallback_summary(keyword, articles, self.summary_lines)
