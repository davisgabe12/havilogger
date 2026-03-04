from __future__ import annotations

import re
from typing import Iterable, List

_CLAUSE_SPLIT_RE = re.compile(r"[,.!?;]")
_TOKEN_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9'’-]*")

_LEADING_SCAFFOLD = {
    "what",
    "how",
    "should",
    "can",
    "could",
    "would",
    "do",
    "did",
    "is",
    "are",
    "if",
    "i",
    "we",
    "my",
    "our",
}

_STOPWORDS = {
    "a",
    "an",
    "the",
    "and",
    "or",
    "to",
    "for",
    "of",
    "in",
    "on",
    "at",
    "is",
    "are",
    "was",
    "were",
}


def _first_clause(message: str) -> str:
    text = re.sub(r"\s+", " ", (message or "").strip())
    if not text:
        return ""
    parts = _CLAUSE_SPLIT_RE.split(text, maxsplit=1)
    return parts[0].strip() if parts else text


def _extract_tokens(text: str) -> List[str]:
    return _TOKEN_RE.findall(text)


def _strip_leading_scaffold(tokens: List[str]) -> List[str]:
    index = 0
    while index < len(tokens) and tokens[index].lower() in _LEADING_SCAFFOLD:
        index += 1
    return tokens[index:]


def _strip_stopwords(tokens: List[str]) -> List[str]:
    return [token for token in tokens if token.lower() not in _STOPWORDS]


def _select_tokens(tokens: List[str]) -> List[str]:
    if len(tokens) <= 5:
        return tokens
    selected = tokens[:5]
    six = tokens[:6]
    if len(" ".join(selected)) < 24 and all(len(token) <= 4 for token in six):
        return six
    return selected


def _capitalize_first(text: str) -> str:
    if not text:
        return text
    return text[0].upper() + text[1:]


def build_session_title_snippet(message: str) -> str:
    clause = _first_clause(message)
    tokens = _extract_tokens(clause)
    tokens = _strip_leading_scaffold(tokens)
    tokens = _strip_stopwords(tokens)
    if len(tokens) < 3:
        return "Chat"
    snippet = " ".join(_select_tokens(tokens)).strip()
    if len(snippet) < 12:
        return "Chat"
    return _capitalize_first(snippet)


def ensure_unique_session_title(base_title: str, existing_titles: Iterable[str]) -> str:
    cleaned = (base_title or "").strip()
    if not cleaned:
        cleaned = "Chat"
    existing = {str(title).strip() for title in existing_titles if str(title).strip()}
    if cleaned not in existing:
        return cleaned
    suffixes = [1]
    prefix = f"{cleaned} · "
    for title in existing:
        if not title.startswith(prefix):
            continue
        suffix = title.replace(prefix, "", 1).strip()
        if suffix.isdigit():
            suffixes.append(int(suffix))
    return f"{cleaned} · {max(suffixes) + 1}"
