import time
from typing import Any, Dict, List

from openai import OpenAI

from .base import LLMAdapter
from .prompts import (
    SELECT_SYSTEM_PROMPT,
    SUMMARY_SYSTEM_PROMPT,
    build_article_content,
    build_selection_content,
    parse_selection,
    parse_summary,
)

MAX_ATTEMPTS = 3


class DeepSeekAdapter(LLMAdapter):
    def __init__(self, api_key: str, base_url: str, model: str, summary_lines: int = 5):
        self.model = model
        self.summary_lines = summary_lines
        self.client = OpenAI(api_key=api_key, base_url=base_url)

    def _call(self, messages: List[Dict[str, str]]):
        return self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            response_format={"type": "json_object"},
        )

    def select_diverse(self, keyword: str, articles: List[Dict[str, Any]], k: int) -> List[Dict[str, Any]]:
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

    def summarize(self, keyword: str, articles: List[Dict[str, Any]]) -> Dict[str, Any]:
        messages = [
            {"role": "system", "content": SUMMARY_SYSTEM_PROMPT.format(n=self.summary_lines)},
            {"role": "user", "content": build_article_content(keyword, articles)},
        ]
        last_error = None
        for attempt in range(MAX_ATTEMPTS):
            try:
                resp = self._call(messages)
                parsed = parse_summary(resp.choices[0].message.content, self.summary_lines)
                if parsed is not None:
                    return parsed
            except Exception as e:
                last_error = e
            if attempt < MAX_ATTEMPTS - 1:
                time.sleep(2 * (attempt + 1))
        raise RuntimeError(f"DeepSeek summarize 실패: {last_error}")
