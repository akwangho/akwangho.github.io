"""Shared helpers for Whisper transcription, word alignment, and dialogue cleanup."""

from __future__ import annotations

import re

TEXT_REPLACEMENTS = {
    r"\bTimmy tip toes\b": "Timmy Tiptoes",
    r"\bTimmy Tip Toes\b": "Timmy Tiptoes",
    r"\bTimmy tip-toes\b": "Timmy Tiptoes",
    r"\bTimmy tiptoes\b": "Timmy Tiptoes",
    r"\bSilver tail\b": "Silvertail",
    r"\bSilver Tail\b": "Silvertail",
    r"\bPeter rabbit\b": "Peter Rabbit",
    r"\bBenjamin bunny\b": "Benjamin Bunny",
    r"\blittle fox\b": "Little Fox",
    r"\bMrs\. rabbit\b": "Mrs. Rabbit",
    r"\bMr\. McGregor\b": "Mr. McGregor",
}

SKIP_PATTERNS = [
    re.compile(r"^\s*\[music\]\s*$", re.I),
    re.compile(r"^\s*\[laughter\]\s*$", re.I),
    re.compile(r"^\s*\[applause\]\s*$", re.I),
    re.compile(r"^\s*$"),
]

LITTLE_FOX_PROMPT = (
    "Little Fox animated English story for children. "
    "Peter Rabbit, Benjamin Bunny, Mrs. Rabbit, Mopsy, Flopsy, Cottontail. "
    "Dialogue uses he said, she said, Peter said, the farmer cried."
)


def format_timestamp(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    h, rem = divmod(ms, 3_600_000)
    m, rem = divmod(rem, 60_000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def clean_text(text: str) -> str:
    text = text.strip()
    for pattern, replacement in TEXT_REPLACEMENTS.items():
        text = re.sub(pattern, replacement, text, flags=re.I)
    return text


def should_skip(text: str) -> bool:
    return any(p.match(text) for p in SKIP_PATTERNS)


def segment_bounds(segment: dict) -> tuple[float, float]:
    """Prefer word-level timestamps for tighter alignment with speech."""
    words = segment.get("words") or []
    if words:
        return round(words[0]["start"], 3), round(words[-1]["end"], 3)
    return round(segment["start"], 3), round(segment["end"], 3)


def words_from_whisper_segment(segment) -> list[dict]:
    out: list[dict] = []
    if not getattr(segment, "words", None):
        return out
    for w in segment.words:
        token = clean_text(getattr(w, "word", "") or "")
        if not token:
            continue
        out.append(
            {
                "word": token,
                "start": round(float(w.start), 3),
                "end": round(float(w.end), 3),
            }
        )
    return out


def _wrap_quote(phrase: str) -> str:
    phrase = phrase.strip().strip('"')
    if not phrase:
        return phrase
    if phrase.startswith('"') and phrase.endswith('"'):
        return phrase
    return f'"{phrase}"'


def _normalize_clause(text: str) -> str:
    """Normalize a single sentence/clause."""
    text = text.strip()
    if not text:
        return text

    text = re.sub(
        r"^(.+?[!.?])\s+(Cried|cried|Said|said)\s+the\s+farmer\.?$",
        lambda m: f'{_wrap_quote(m.group(1))} {"he said" if m.group(1).strip().endswith("?") else "he cried"}.',
        text,
    )
    text = re.sub(
        r'^Where is that rabbit\?\s*(?:Cried|said)\s+the farmer\.?$',
        '"Where is that rabbit?" he said.',
        text,
        flags=re.I,
    )
    # ASR inversion: "Hello said farmer" / "said farmer"
    text = re.sub(
        r"^(?P<q>.+?),\s*said the farmer\.?$",
        lambda m: f'"{m.group("q").strip()}" the farmer said.',
        text,
        flags=re.I,
    )
    if re.fullmatch(r"(?i)said\s+farmer\.?", text.strip()):
        return "He said."

    m = re.match(r"^(.+?),\s*said the farmer\.?$", text, re.I)
    if m:
        quote = m.group(1).strip().strip('"')
        if not quote.endswith(("?", "!", ".")):
            quote += "?"
        return f'"{quote}" the farmer said.'

    m = re.match(r"^(.+?),\s*(he|she)\s+said\.?$", text, re.I)
    if m:
        quote = m.group(1).strip().strip('"')
        who = m.group(2).lower()
        if not quote.endswith(("?", "!", ".")):
            if "?" in quote or quote.lower().startswith(("can ", "where ", "what ", "who ", "how ", "why ")):
                quote += "?"
            else:
                quote += "."
        return f'"{quote}" {who} said.'

    m = re.match(r"^(.+?),\s*she said\.?$", text, re.I)
    if m:
        quote = m.group(1).strip().strip('"')
        if not quote.endswith(("?", "!", ".")):
            quote += "."
        return f'"{quote}" she said.'

    m = re.match(r"^(.+?),\s*([^,.]+)\s+said\.?$", text, re.I)
    if m and m.group(2).lower() not in {"yes", "no", "yum", "news", "ooh", "mmm"}:
        quote = m.group(1).strip().strip('"')
        speaker = m.group(2).strip()
        if not quote.endswith(("?", "!", ".")):
            quote += "."
        return f'"{quote}" {speaker} said.'

    # "Yes, said his mother, but ..." -> keep words, fix punctuation
    m = re.match(r"^(Yes|No|Okay|Yum|News|Ooh|Mmm),?\s*said\s+(.+?),\s*(.+)$", text, re.I)
    if m:
        return f'"{m.group(1).capitalize()}," said {m.group(2)}, "{m.group(3).strip()}'

    text = re.sub(
        r"^(.+?[!.?])\s+He (cried|said)\.?$",
        lambda m: f'{_wrap_quote(m.group(1))} he {m.group(2).lower()}.',
        text,
        flags=re.I,
    )
    text = re.sub(
        r"^(.+?[!.?])\s+Cried\s+([A-Za-z]+)\.?$",
        lambda m: f'{_wrap_quote(m.group(1))} {m.group(2)} cried.',
        text,
    )
    text = re.sub(
        r"^(.+?[!.?])\s+Whispered\s+([A-Za-z]+)\.?$",
        lambda m: f'{_wrap_quote(m.group(1))} {m.group(2)} whispered.',
        text,
    )
    text = re.sub(
        r"^(.+?[!.?])\s+Called\s+someone\.?$",
        lambda m: f'{_wrap_quote(m.group(1))} Someone called.',
        text,
        flags=re.I,
    )

    if re.fullmatch(r"(?i)(?:cried|said)\s+the farmer\.?", text.strip()):
        return "He cried." if text.lower().startswith("cried") else "He said."

    if text and text[0].islower():
        text = text[0].upper() + text[1:]
    return text


def normalize_spoken_line(text: str) -> str:
    """Light cleanup only — fix ASR inversions while keeping spoken words."""
    text = clean_text(text)
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return text
    parts = re.split(r"(?<=[.!?])\s+", text)
    if len(parts) > 1:
        normalized = [_normalize_clause(p) for p in parts if p.strip()]
        for i in range(1, len(normalized)):
            m = re.match(r"^Whispered\s+([A-Za-z]+)\.?$", normalized[i], re.I)
            if m and normalized[i - 1].rstrip().endswith("?"):
                normalized[i - 1] = f'{_wrap_quote(normalized[i - 1])} {m.group(1)} whispered.'
                normalized[i] = ""
            if normalized[i].lower() == "he cried." and normalized[i - 1].rstrip().endswith("?"):
                normalized[i - 1] = f'{_wrap_quote(normalized[i - 1])} he said.'
                normalized[i] = ""
        return " ".join(p for p in normalized if p)
    return _normalize_clause(text)


def join_segment_texts(segments: list[dict], indices: list[int]) -> str:
    parts: list[str] = []
    for i in indices:
        for unit in split_segment_by_punctuation(segments[i]):
            if unit["text"] and not should_skip(unit["text"]):
                parts.append(unit["text"])
    joined = " ".join(parts)
    return normalize_spoken_line(joined) if joined else ""


def needle_from_en(en: str) -> str:
    """Search phrase for remapping teaching sentences onto Whisper segments."""
    t = en.strip()
    for pat in (
        r"^The [Tt]ale of (?:Peter Rabbit|Benjamin Bunny),?\s*Episode \d+:?\s*[^\"]*",
        r"^The [Tt]ale of (?:Peter Rabbit|Benjamin Bunny)\.?\s*Episode \w+\.?\s*[^.]*\.?\s*",
    ):
        t = re.sub(pat, "", t, flags=re.I).strip()
    first = re.split(r'(?<=[.!?])\s+', t)[0].strip().strip('"')
    first = re.split(
        r',?\s*(?:the farmer|his father|he|she|Peter|Benjamin)\s+(?:said|cried|muttered|whispered)',
        first,
        maxsplit=1,
        flags=re.I,
    )[0].strip().strip('"')
    if len(first) >= 4:
        return first
    m = re.search(r'"([^"]{6,})"', t)
    if m:
        return m.group(1)
    for part in re.split(r"[.!?]", t):
        part = part.strip().strip('"')
        if len(part) >= 6:
            return part
    return t[:48]


def token_overlap(a: str, b: str) -> float:
    ta = set(re.findall(r"[a-z']+", a.lower()))
    tb = set(re.findall(r"[a-z']+", b.lower()))
    if not ta:
        return 0.0
    return len(ta & tb) / len(ta)


def remap_entry_segments(
    entry: dict,
    segments: list[dict],
    cursor: int,
    chapter_end: int,
    used: set[int],
) -> tuple[list[int], int]:
    target = entry["en"]
    needle = needle_from_en(target).lower()
    old_n = max(1, len(entry.get("segments") or [1]))
    chapter_end = min(chapter_end, len(segments))
    lo = SEGMENT_CHAPTER_BOUNDARIES[entry["chapter"]]
    start = max(cursor, lo)
    while start < chapter_end and start in used:
        start += 1
    if start >= chapter_end:
        return [], start

    for i in range(start, min(start + 4, chapter_end)):
        if i in used:
            continue
        if len(needle) >= 6 and needle in segments[i]["text"].lower():
            if i > start and (i - 1) not in used:
                start = i - 1
            else:
                start = i
            break

    best_idxs: list[int] = []
    best_score = -1.0
    for n in range(max(1, old_n - 1), old_n + 2):
        trial = list(range(start, min(start + n, chapter_end)))
        if not trial or any(j in used for j in trial):
            continue
        spoken = join_segment_texts(segments, trial)
        score = token_overlap(target, spoken)
        if needle and needle in spoken.lower():
            score += 0.15
        score -= 0.05 * abs(len(trial) - old_n)
        score -= 0.002 * sum(len(segments[j]["text"]) for j in trial)
        if score > best_score or (abs(score - best_score) < 0.01 and len(trial) > len(best_idxs)):
            best_score = score
            best_idxs = trial

    if not best_idxs:
        best_idxs = [start]

    for j in best_idxs:
        used.add(j)
    return best_idxs, best_idxs[-1] + 1


def phrase_time_bounds(segments: list[dict], lo: int, hi: int, phrase: str) -> tuple[float, float] | None:
    """Find start/end seconds for a spoken phrase inside word timestamps."""
    phrase_tokens = re.findall(r"[a-z']+", phrase.lower())
    if not phrase_tokens:
        return None
    hi = min(hi, len(segments))
    for seg_i in range(lo, hi):
        words = segments[seg_i].get("words") or []
        if not words:
            continue
        norm = [re.sub(r"[^a-z']+", "", w["word"].lower()) for w in words]
        for start in range(len(norm) - len(phrase_tokens) + 1):
            if norm[start : start + len(phrase_tokens)] == phrase_tokens:
                return round(words[start]["start"], 2), round(words[start + len(phrase_tokens) - 1]["end"], 2)
        if len(phrase_tokens) >= 2 and phrase_tokens[0] in norm:
            idx = norm.index(phrase_tokens[0])
            end_idx = min(idx + len(phrase_tokens) - 1, len(words) - 1)
            return round(words[idx]["start"], 2), round(words[end_idx]["end"], 2)
    return None


def spoken_from_token_sequence(
    segments: list[dict], lo: int, hi: int, token_list: list[str]
) -> tuple[str, float, float] | None:
    """Extract exact word sequence (spoken alignment) from chapter word stream."""
    hi = min(hi, len(segments))
    all_words: list[dict] = []
    for seg_i in range(lo, hi):
        all_words.extend(segments[seg_i].get("words") or [])
    if not all_words or not token_list:
        return None
    norm = [re.sub(r"[^a-z']+", "", w["word"].lower()) for w in all_words]
    target = [re.sub(r"[^a-z']+", "", t.lower()) for t in token_list]
    for start in range(len(norm) - len(target) + 1):
        if norm[start : start + len(target)] == target:
            picked = all_words[start : start + len(target)]
            text = normalize_spoken_line(" ".join(w["word"] for w in picked))
            return text, round(picked[0]["start"], 2), round(picked[-1]["end"], 2)
    return None


def spoken_from_word_range(segments: list[dict], start: float, end: float) -> str:
    words: list[str] = []
    for seg in segments:
        for w in seg.get("words") or []:
            if w["end"] < start - 0.05:
                continue
            if w["start"] > end + 0.05:
                continue
            if w["end"] >= start - 0.05 and w["start"] <= end + 0.05:
                words.append(w["word"])
    return normalize_spoken_line(" ".join(words)) if words else ""


def fallback_bounds(entry: dict, segments: list[dict]) -> tuple[list[int], float, float, str]:
    """When remap finds no segments, locate phrase timing inside the chapter."""
    ch = entry["chapter"]
    lo = SEGMENT_CHAPTER_BOUNDARIES[ch]
    hi = min(SEGMENT_CHAPTER_BOUNDARIES[ch + 1], len(segments))
    phrase = needle_from_en(entry["en"])
    bounds = phrase_time_bounds(segments, lo, hi, phrase)
    spoken = ""
    if bounds:
        start, end = bounds
        spoken = spoken_from_word_range(segments, start, end)
        for i in range(lo, hi):
            if segments[i]["start"] <= start <= segments[i]["end"] + 0.5:
                return [i], start, end, spoken or entry["en"]
    return [], float(segments[lo]["start"]), float(segments[min(lo, hi - 1)]["end"]), entry["en"]


def remap_sentence_map(segments: list[dict], sentence_map: list[dict]) -> list[dict]:
    cursors = {ch: SEGMENT_CHAPTER_BOUNDARIES[ch] for ch in range(len(SEGMENT_CHAPTER_BOUNDARIES) - 1)}
    used: set[int] = set()
    out: list[dict] = []
    for entry in sentence_map:
        ch = entry["chapter"]
        end = SEGMENT_CHAPTER_BOUNDARIES[ch + 1]
        idxs, cursors[ch] = remap_entry_segments(entry, segments, cursors[ch], end, used)
        out.append({**entry, "segments": idxs})
    return out


def sentences_to_srt(sentences: list[dict]) -> str:
    lines: list[str] = []
    for i, s in enumerate(sentences, 1):
        lines.append(str(i))
        lines.append(f"{format_timestamp(float(s['start']))} --> {format_timestamp(float(s['end']))}")
        lines.append(s["en"])
        lines.append("")
    return "\n".join(lines)


def split_segment_by_punctuation(segment: dict) -> list[dict]:
    """Split a long Whisper segment into sentence-sized cues using word timestamps."""
    words = segment.get("words") or []
    text = segment.get("text", "").strip()
    if not words:
        if not text:
            return []
        return [{"text": clean_text(text), "start": segment["start"], "end": segment["end"]}]

    parts: list[dict] = []
    buf: list[dict] = []
    for w in words:
        buf.append(w)
        token = w["word"].strip()
        if token.endswith((".", "!", "?", '."', '!"', '?"')):
            phrase = " ".join(x["word"] for x in buf)
            phrase = clean_text(phrase)
            if phrase and not should_skip(phrase):
                parts.append(
                    {
                        "text": phrase,
                        "start": buf[0]["start"],
                        "end": buf[-1]["end"],
                    }
                )
            buf = []
    if buf:
        phrase = clean_text(" ".join(x["word"] for x in buf))
        if phrase and not should_skip(phrase):
            parts.append(
                {
                    "text": phrase,
                    "start": buf[0]["start"],
                    "end": buf[-1]["end"],
                }
            )
    return parts


# Segment index boundaries for ZB4lOVRMt5I (large-v3 pass, 277 segments)
SEGMENT_CHAPTER_BOUNDARIES = [0, 15, 46, 86, 127, 163, 205, 254, 9999]


def chapter_for_segment_index(index: int) -> int:
    for ch in range(len(SEGMENT_CHAPTER_BOUNDARIES) - 1):
        if SEGMENT_CHAPTER_BOUNDARIES[ch] <= index < SEGMENT_CHAPTER_BOUNDARIES[ch + 1]:
            return ch
    return 7


def flatten_segments_to_sentences(segments: list[dict]) -> list[dict]:
    """Expand segments to sentence-level units with fixed chapter boundaries."""
    out: list[dict] = []
    for i, seg in enumerate(segments):
        chapter = chapter_for_segment_index(i)
        for unit in split_segment_by_punctuation(seg):
            t = unit["text"]
            out.append(
                {
                    "chapter": chapter,
                    "en": t,
                    "start": round(unit["start"], 2),
                    "end": round(unit["end"], 2),
                }
            )
    return out


def range_bounds(segments: list[dict], indices: list[int]) -> tuple[float, float]:
    starts: list[float] = []
    ends: list[float] = []
    for i in indices:
        s, e = segment_bounds(segments[i])
        starts.append(s)
        ends.append(e)
    return round(min(starts), 2), round(max(ends), 2)
