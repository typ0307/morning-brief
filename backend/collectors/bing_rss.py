from datetime import datetime
from typing import List
from urllib.parse import quote_plus

import feedparser

from .base import Article, Collector


class BingNewsRSSCollector(Collector):
    name = "bing_rss"

    def collect(self, keyword: str) -> List[Article]:
        url = f"https://www.bing.com/news/search?q={quote_plus(keyword)}&format=rss&mkt=ko-KR"
        feed = feedparser.parse(url)
        articles: List[Article] = []
        for entry in feed.entries:
            published = None
            if entry.get("published_parsed"):
                published = datetime(*entry.published_parsed[:6])
            articles.append(
                Article(
                    title=entry.get("title", ""),
                    url=entry.get("link", ""),
                    snippet=entry.get("summary", "") or entry.get("description", ""),
                    published_at=published,
                )
            )
        return [a for a in articles if a.url]
