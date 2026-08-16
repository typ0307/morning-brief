from abc import ABC, abstractmethod
from typing import Any


class LLMAdapter(ABC):
    @abstractmethod
    def select_diverse(self, keyword: str, articles: list[dict[str, Any]], k: int) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def summarize(self, keyword: str, articles: list[dict[str, Any]]) -> dict[str, Any]:
        raise NotImplementedError
