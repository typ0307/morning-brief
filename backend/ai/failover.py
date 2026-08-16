import logging
from typing import Any, Dict, List

from .base import LLMAdapter
from .prompts import fallback_summary

logger = logging.getLogger(__name__)


class FailoverLLMAdapter(LLMAdapter):
    def __init__(self, primary: LLMAdapter, secondary: LLMAdapter, summary_lines: int = 5):
        self.primary = primary
        self.secondary = secondary
        self.summary_lines = summary_lines

    def select_diverse(self, keyword: str, articles: List[Dict[str, Any]], k: int) -> List[Dict[str, Any]]:
        try:
            return self.primary.select_diverse(keyword, articles, k)
        except Exception as e:
            logger.warning("primary LLM 기사 선별 실패, secondary 사용: %s", e)
            return self.secondary.select_diverse(keyword, articles, k)

    def summarize(self, keyword: str, articles: List[Dict[str, Any]]) -> Dict[str, Any]:
        try:
            return self.primary.summarize(keyword, articles)
        except Exception as e:
            logger.warning("primary LLM 요약 실패, secondary 사용: %s", e)
            try:
                return self.secondary.summarize(keyword, articles)
            except Exception as e2:
                logger.error("두 LLM 모두 요약 실패, raw fallback: %s", e2)
                return fallback_summary(keyword, articles, self.summary_lines)
