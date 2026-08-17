"""네이버 뉴스 검색 API 수집기."""

import html
import logging
import re
from datetime import datetime
from email.utils import parsedate_to_datetime

import requests

from .base import Article, Collector

logger = logging.getLogger(__name__)


def _clean(value: str) -> str:
    s = re.sub(r"<[^>]+>", " ", str(value or ""))
    return html.unescape(s).replace("\xa0", " ").strip()


class NaverNewsCollector(Collector):
    name = "naver_news"

    def __init__(self, client_id: str, client_secret: str):
        self.client_id = client_id
        self.client_secret = client_secret

    def collect(self, keyword: str) -> list[Article]:
        url = "https://openapi.naver.com/v1/search/news.json"
        headers = {
            "X-Naver-Client-Id": self.client_id,
            "X-Naver-Client-Secret": self.client_secret,
        }
        params = {
            "query": keyword,
            "display": 100,
            "start": 1,
            "sort": "date",
        }
        resp = requests.get(url, headers=headers, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        articles: list[Article] = []
        for item in data.get("items", []):
            link = item.get("originallink") or item.get("link") or ""
            articles.append(
                Article(
                    title=_clean(item.get("title", "")),
                    url=link,
                    snippet=_clean(item.get("description", "")),
                    published_at=self._parse_pubdate(item.get("pubDate")),
                )
            )
        return [a for a in articles if a.url]

    @staticmethod
    def _parse_pubdate(value: str | None) -> datetime | None:
        if not value:
            return None
        try:
            return parsedate_to_datetime(value)
        except (TypeError, ValueError) as e:
            logger.warning("pubDate 파싱 실패: %s (%s)", value, e)
            return None
