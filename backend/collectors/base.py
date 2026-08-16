from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass
class Article:
    title: str = ""
    url: str = ""
    snippet: str = ""
    body: str = ""
    published_at: datetime | None = None

    def to_db(self, topic_id: str) -> dict:
        published = None
        if self.published_at is not None:
            if self.published_at.tzinfo is None:
                published = self.published_at.replace(tzinfo=timezone.utc)
            else:
                published = self.published_at
            published = published.isoformat()
        return {
            "topic_id": topic_id,
            "title": self.title,
            "url": self.url,
            "snippet": self.snippet,
            "body": self.body,
            "published_at": published,
        }


class Collector(ABC):
    name: str = "base"

    @abstractmethod
    def collect(self, keyword: str) -> list[Article]:
        raise NotImplementedError
