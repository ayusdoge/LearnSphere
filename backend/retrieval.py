from __future__ import annotations

import math
import re
import shutil
import subprocess
import tempfile
from functools import lru_cache
from pathlib import Path

SOURCE_DIR = Path(__file__).resolve().parent / "sources"
SUPPORTED_EXTENSIONS = {".md", ".txt", ".rtf", ".pdf", ".docx"}
MAX_SOURCE_FILES = 100
MAX_TEXT_SOURCE_BYTES = 1_000_000
MAX_BINARY_DOCUMENT_BYTES = 10_000_000
MAX_BINARY_BASE64_CHARS = ((MAX_BINARY_DOCUMENT_BYTES + 2) // 3) * 4
MAX_CHUNK_CHARS = 1200

_WORDS = re.compile(r"[a-z0-9]+|[\u0900-\u097f]+", re.IGNORECASE)
_HEADING = re.compile(r"^#{1,6}\s+(.+?)\s*#*\s*$")
_STOP_WORDS = {
    "a", "about", "an", "and", "are", "as", "at", "be", "because", "but",
    "by", "can", "could", "do", "does", "explain", "for", "from", "give",
    "how", "i", "in", "is", "it", "me", "of", "on", "or", "please",
    "show", "that", "the", "this", "to", "use", "what", "when", "where",
    "which", "why", "with", "would", "you", "का", "की", "के", "को", "और",
    "है", "हैं", "में", "से", "क्या", "कैसे", "क्यों", "एक", "यह", "इस",
}


def _terms(text: str) -> set[str]:
    return {
        word.lower()
        for word in _WORDS.findall(text)
        if (len(word) > 2 or "\u0900" <= word[0] <= "\u097f")
        and word.lower() not in _STOP_WORDS
    }


def _split_long_text(text: str) -> list[str]:
    chunks = []
    remaining = text.strip()
    while remaining:
        end = min(len(remaining), MAX_CHUNK_CHARS)
        if end < len(remaining):
            whitespace = remaining.rfind(" ", 0, end)
            if whitespace > MAX_CHUNK_CHARS // 2:
                end = whitespace
        chunk = remaining[:end].strip()
        if chunk:
            chunks.append(chunk)
        remaining = remaining[end:].strip()
    return chunks


@lru_cache(maxsize=256)
def _read_source_text(path_string: str, modified_ns: int, size: int) -> str:
    path = Path(path_string)
    suffix = path.suffix.lower()
    if suffix in {".pdf", ".docx"}:
        try:
            return _extract_binary_document(path)
        except (OSError, subprocess.SubprocessError, RuntimeError):
            return ""
    if suffix == ".rtf":
        extractor = shutil.which("textutil")
        if not extractor:
            return ""
        try:
            result = subprocess.run(
                [extractor, "-convert", "txt", "-stdout", str(path)],
                check=True,
                capture_output=True,
                text=True,
                timeout=10,
            )
            return result.stdout
        except (OSError, subprocess.SubprocessError):
            return ""
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def _extract_binary_document(path: Path) -> str:
    suffix = path.suffix.lower()
    extractor = shutil.which("swift" if suffix == ".pdf" else "textutil")
    if not extractor:
        raise RuntimeError(f"The local {suffix[1:].upper()} text extractor is not available")
    if suffix == ".pdf":
        helper = Path(__file__).resolve().with_name("extract_pdf.swift")
        command = [extractor, str(helper), str(path)]
        timeout = 45
    elif suffix == ".docx":
        command = [extractor, "-convert", "txt", "-stdout", str(path)]
        timeout = 10
    else:
        raise ValueError("Only PDF and Word documents can be extracted")
    result = subprocess.run(
        command,
        check=True,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    return result.stdout


def _read_chunks(path: Path, root: Path) -> list[dict[str, str]]:
    try:
        metadata = path.stat()
        maximum_bytes = MAX_BINARY_DOCUMENT_BYTES if path.suffix.lower() in {".pdf", ".docx"} else MAX_TEXT_SOURCE_BYTES
        if metadata.st_size > maximum_bytes:
            return []
        text = _read_source_text(str(path), metadata.st_mtime_ns, metadata.st_size)
    except OSError:
        return []

    return _chunks_from_text(text, path.relative_to(root).as_posix(), path.stem)


def _chunks_from_text(text: str, citation_prefix: str, default_section: str) -> list[dict[str, str]]:
    chunks: list[dict[str, str]] = []
    section = default_section
    lines: list[str] = []

    def flush() -> None:
        paragraph = " ".join(line.strip() for line in lines).strip()
        for part in _split_long_text(paragraph):
            chunks.append({
                "citation": f"{citation_prefix} — {section}",
                "text": part,
            })
        lines.clear()

    for line in text.splitlines():
        heading = _HEADING.match(line.strip())
        if heading:
            flush()
            section = heading.group(1)
        elif line.strip():
            lines.append(line)
        else:
            flush()
    flush()
    return chunks


def _rank_chunks(
    question: str,
    chunks: list[dict[str, str]],
    limit: int,
    include_unmatched: bool = False,
) -> list[dict[str, str]]:
    if limit <= 0 or not chunks:
        return []

    query_terms = _terms(question)
    if not query_terms:
        return chunks[:limit] if include_unmatched else []

    ranked: list[tuple[float, dict[str, str]]] = []
    for chunk in chunks:
        chunk_terms = _terms(chunk["text"])
        overlap = query_terms & chunk_terms
        if not overlap:
            continue
        coverage = len(overlap) / len(query_terms)
        score = coverage + len(overlap) / math.sqrt(max(1, len(chunk_terms)))
        ranked.append((score, chunk))

    if not ranked and include_unmatched:
        return chunks[:limit]

    ranked.sort(key=lambda item: (-item[0], item[1]["citation"]))
    selected: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for _, chunk in ranked:
        key = (chunk["citation"], chunk["text"])
        if key in seen:
            continue
        seen.add(key)
        selected.append(chunk)
        if len(selected) == limit:
            break
    return selected


def find_relevant_document(
    question: str,
    filename: str,
    content: bytes,
    limit: int = 5,
) -> list[dict[str, str]]:
    """Extract and rank excerpts from one temporary PDF or Word attachment."""
    suffix = Path(filename).suffix.lower()
    if suffix not in {".pdf", ".docx"}:
        raise ValueError("Only PDF and Word documents can be attached to a question")

    with tempfile.TemporaryDirectory(prefix="learnsphere-attachment-") as directory:
        path = Path(directory) / f"attachment{suffix}"
        path.write_bytes(content)
        try:
            text = _extract_binary_document(path)
        except (OSError, subprocess.SubprocessError) as error:
            raise RuntimeError(f"Could not extract text from {filename}") from error

    if not text.strip():
        raise ValueError(f"No readable text was found in {filename}")

    chunks = _chunks_from_text(text, f"Attached document: {filename}", Path(filename).stem)
    return _rank_chunks(question, chunks, limit, include_unmatched=True)


def clear_source_text_cache() -> None:
    """Drop cached local excerpts after a note is added or removed."""
    _read_source_text.cache_clear()


def find_relevant_sources(question: str, limit: int = 3) -> list[dict[str, str]]:
    """Return the best matching excerpts from local Markdown and text notes."""
    if not _terms(question) or limit <= 0:
        return []

    try:
        paths = sorted(
            path for path in SOURCE_DIR.rglob("*")
            if path.is_file()
            and not path.name.startswith(".")
            and path.suffix.lower() in SUPPORTED_EXTENSIONS
        )[:MAX_SOURCE_FILES]
    except OSError:
        return []

    chunks: list[dict[str, str]] = []
    for path in paths:
        chunks.extend(_read_chunks(path, SOURCE_DIR))
    return _rank_chunks(question, chunks, limit)
