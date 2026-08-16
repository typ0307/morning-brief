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


class OpenAICompatAdapter(LLMAdapter):
    def __init__(self, api_key: str, base_url: str, model: str, summary_lines: int = 5):
        self.model = model
        self.summary_lines = summary_lines
        self.client = OpenAI(api_key=api_key, base_url=base_url)

    def _call(self, messages: list[dict[str, str]], require_json: bool = True) -> str:
        kwargs = {}
        if require_json:
            kwargs["response_format"] = {"type": "json_object"}
        try:
            resp = self.client.chat.completions.create(
                model=self.model, messages=messages, **kwargs
            )
        except Exception as e:
            if require_json:
                logger.warning(
                    "%s 모델 JSON 모드 실패, 일반 모드로 재시도: %s", self.model, e
                )
                return self._call(messages, require_json=False)
            raise
        content = self._extract_content(resp)
        if content:
            return content
        if require_json:
            logger.warning("%s 모델 응답 content 없음, 일반 모드로 재시도", self.model)
            return self._call(messages, require_json=False)
        raise ValueError("LLM 응답에 content가 없습니다")

    @staticmethod
    def _extract_content(resp) -> str | None:
        try:
            choices = resp.choices
            if not choices:
                return None
            content = choices[0].message.content
            return content if content else None
        except (AttributeError, IndexError, TypeError):
            return None

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
                selected = parse_selection(resp, articles, k)
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
                parsed = parse_summary(resp, self.summary_lines)
                if parsed is not None:
                    return parsed
            except Exception as e:
                logger.warning("LLM 요약 시도 실패: %s", e)
            if attempt < MAX_ATTEMPTS - 1:
                time.sleep(2 * (attempt + 1))
        logger.warning("LLM 요약 실패, 본문 텍스트 fallback 사용")
        return fallback_summary(keyword, articles, self.summary_lines)
