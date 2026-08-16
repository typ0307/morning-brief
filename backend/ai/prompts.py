import html as html_module
import json
import re
from typing import Any

SUMMARY_SYSTEM_PROMPT = (
    "당신은 뉴스 요약 전문가입니다. 주어진 뉴스 기사를 바탕으로 "
    "출근길 모바일 환경에 맞는 팩트 중심 {n}줄 요약을 작성하세요.\n"
    "반드시 다음 JSON 형식으로만 응답하세요:\n"
    '{{"title": "브리핑 제목", "summary": ["요약 1", "요약 2", ..., "요약 {n}"], "sentiment": "neutral"}}\n'
    "- summary는 정확히 {n}개 항목의 문자열 배열입니다.\n"
    "- 각 줄은 서로 다른 이슈를 담아 중복 없이 다양하게 요약하세요.\n"
    '- sentiment는 "positive", "neutral", "negative" 중 하나입니다.\n'
    "JSON 외 다른 텍스트는 포함하지 마세요."
)

SELECT_SYSTEM_PROMPT = (
    "당신은 뉴스 큐레이션 전문가입니다. 아래 기사 목록에서 같은 사건·이슈를 다룬 중복 기사를 제거하고, "
    "서로 다른 대표 기사를 최대 {k}개 선택하세요.\n"
    "중요도(최신성·영향력)와 다양성(서로 다른 주제)을 모두 고려하세요.\n"
    '반드시 다음 JSON 형식으로만 응답하세요: {{"selected": [기사번호, ...]}}\n'
    "기사번호는 목록의 번호(1부터 시작)여야 합니다.\n"
    "JSON 외 다른 텍스트는 포함하지 마세요."
)


def clean(text: Any) -> str:
    s = re.sub(r"<[^>]+>", " ", str(text or ""))
    return html_module.unescape(s).replace("\xa0", " ").strip()


def parse_json(text: str | None) -> dict[str, Any] | None:
    if not text:
        return None
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()
    try:
        data = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return None
    return data if isinstance(data, dict) else None


def build_selection_content(articles: list[dict[str, Any]]) -> str:
    lines = []
    for i, a in enumerate(articles, 1):
        title = clean(a.get("title"))
        snippet = clean(a.get("snippet"))[:120]
        lines.append(f"[{i}] {title} | {snippet}")
    return "\n".join(lines)


def build_article_content(keyword: str, articles: list[dict[str, Any]]) -> str:
    chunks = [f"키워드: {keyword}"]
    for i, a in enumerate(articles, 1):
        title = clean(a.get("title"))
        text = clean(a.get("body") or a.get("snippet"))[:1500]
        chunks.append(f"[기사 {i}] 제목: {title}\n본문: {text}")
    return "\n\n".join(chunks)


def parse_selection(text: str | None, articles: list[dict[str, Any]], k: int) -> list[dict[str, Any]]:
    data = parse_json(text)
    if data is None:
        return []
    selected = data.get("selected")
    if not isinstance(selected, list):
        return []
    result = []
    seen = set()
    for x in selected:
        if not isinstance(x, int) or not (1 <= x <= len(articles)):
            continue
        idx = x - 1
        if idx in seen:
            continue
        seen.add(idx)
        result.append(articles[idx])
    return result[:k]


def parse_summary(text: str | None, n_lines: int) -> dict[str, Any] | None:
    data = parse_json(text)
    if data is None:
        return None
    summary = data.get("summary")
    if not isinstance(summary, list) or len(summary) != n_lines:
        return None
    sentiment = data.get("sentiment") or "neutral"
    if sentiment not in ("positive", "neutral", "negative"):
        sentiment = "neutral"
    return {
        "title": str(data.get("title") or ""),
        "summary": [str(s) for s in summary],
        "sentiment": sentiment,
    }


def fallback_summary(keyword: str, articles: list[dict[str, Any]], n_lines: int) -> dict[str, Any]:
    lines = []
    for a in articles:
        if len(lines) >= n_lines:
            break
        text = clean(a.get("body") or a.get("snippet"))
        sentences = [s.strip() for s in re.split(r"(?<=[.!?。])\s+|\n", text) if s.strip()]
        if sentences:
            lines.append(sentences[0][:150])
    while len(lines) < n_lines:
        lines.append("")
    return {
        "title": f"[{keyword}] 뉴스 요약",
        "summary": lines[:n_lines],
        "sentiment": "neutral",
    }
