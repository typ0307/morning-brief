from typing import List

from .base import Article, Collector


class NaverNewsCollector(Collector):
    name = "naver_news"

    def collect(self, keyword: str) -> List[Article]:
        raise NotImplementedError("Naver News API 어댑터는 MVP에서 미구현 (스텁)")
