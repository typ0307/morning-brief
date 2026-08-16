from abc import ABC, abstractmethod
from typing import Any, Dict, List


class LLMAdapter(ABC):
    @abstractmethod
    def select_diverse(self, keyword: str, articles: List[Dict[str, Any]], k: int) -> List[Dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def summarize(self, keyword: str, articles: List[Dict[str, Any]]) -> Dict[str, Any]:
        raise NotImplementedError
