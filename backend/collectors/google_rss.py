from datetime import datetime
from urllib.parse import quote_plus

import feedparser

from .base import Article, Collector


class GoogleNewsRSSCollector(Collector):
    name = "google_rss"

    def collect(self, keyword: str) -> list[Article]:
        url = f"https://news.google.com/rss/search?q={quote_plus(keyword)}&hl=ko&gl=KR&ceid=KR:ko"
        feed = feedparser.parse(url)
        articles: list[Article] = []
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
