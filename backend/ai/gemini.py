import time
from typing import Any, Dict, List

import requests

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


class GeminiAdapter(LLMAdapter):
    def __init__(self, api_key: str, base_url: str, model: str, summary_lines: int = 5):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.summary_lines = summary_lines

    def _generate(self, system_prompt: str, user_content: str) -> str:
        url = f"{self.base_url}/models/{self.model}:generateContent"
        payload = {
            "contents": [{"role": "user", "parts": [{"text": f"{system_prompt}\n\n{user_content}"}]}],
            "generationConfig": {
                "response_mime_type": "application/json",
                "temperature": 0.3,
            },
        }
        resp = requests.post(
            url,
            headers={"X-goog-api-key": self.api_key},
            json=payload,
            timeout=60,
        )
        resp.raise_for_status()
        data = resp.json()
        candidates = data.get("candidates") or []
        if not candidates:
            raise RuntimeError("Gemini 응답에 candidates 없음")
        parts = candidates[0].get("content", {}).get("parts") or []
        return "".join(p.get("text", "") for p in parts)

    def select_diverse(self, keyword: str, articles: List[Dict[str, Any]], k: int) -> List[Dict[str, Any]]:
        if len(articles) <= k:
            return list(articles)
        system = SELECT_SYSTEM_PROMPT.format(k=k)
        user = build_selection_content(articles)
        for attempt in range(MAX_ATTEMPTS):
            try:
                text = self._generate(system, user)
                selected = parse_selection(text, articles, k)
                if selected:
                    return selected
            except Exception:
                pass
            if attempt < MAX_ATTEMPTS - 1:
                time.sleep(2 * (attempt + 1))
        return list(articles[:k])

    def summarize(self, keyword: str, articles: List[Dict[str, Any]]) -> Dict[str, Any]:
        system = SUMMARY_SYSTEM_PROMPT.format(n=self.summary_lines)
        user = build_article_content(keyword, articles)
        last_error = None
        for attempt in range(MAX_ATTEMPTS):
            try:
                text = self._generate(system, user)
                parsed = parse_summary(text, self.summary_lines)
                if parsed is not None:
                    return parsed
            except Exception as e:
                last_error = e
            if attempt < MAX_ATTEMPTS - 1:
                time.sleep(2 * (attempt + 1))
        raise RuntimeError(f"Gemini summarize 실패: {last_error}")
