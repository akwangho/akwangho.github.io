#!/usr/bin/env python3
"""Forced-align teaching sentences to audio with torchaudio CTC (MMS_FA).

This is the "釜底抽薪" timing fix. Instead of fuzzy-matching ASR word
timestamps onto the known text, we take the already-correct transcript
(DEFAULT_SENTENCES in the lesson HTML) plus the audio and run true CTC
forced alignment to get accurate per-word times. Each sentence's start/end
is then derived from its first/last aligned word.

Pipeline notes:
  - wav2vec2 self-attention is O(T^2), so we never run the whole clip in one
    pass. Emission is computed in stitched ~30s chunks, then forced_align runs
    per chapter over the matching emission slice.
  - The spoken intro ("Little Fox") and the four "Episode N" titles are NOT in
    DEFAULT_SENTENCES, so they are injected as alignment-only anchors per
    chapter to keep alignment monotonic across chapter boundaries. Their times
    are discarded.

Run (inside the torch venv):
  scripts/.cache/align-venv/bin/python scripts/align-lesson.py \
    --html eng/2026-06-28-Peter-Rabbit-Harvest-Feast.html \
    --wav scripts/.cache/ueIkpeMWPYQ.wav \
    --sentences-json scripts/.cache/ueIkpeMWPYQ-sentences.json \
    --srt eng/sub/2026-06-28-Peter-Rabbit-Harvest-Feast.srt \
    --apply
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

# Alignment-only anchors: spoken lines that are not teaching sentences
# (intro jingle, episode titles). They keep CTC alignment monotonic across
# chapter boundaries; their own times are discarded. Per-video anchors can be
# supplied via a "chapter_anchors" field in the sentences JSON; otherwise these
# Harvest Feast defaults are used. Numbers are spelled out so the CTC letter
# dictionary can consume them.
DEFAULT_CHAPTER_ANCHORS = {
    0: [
        "little fox",
        "peter and benjamin have a feast episode one gathering nuts",
    ],
    1: ["peter and benjamin have a feast episode two the nut thief"],
    2: ["peter and benjamin have a feast episode three silvertail"],
    3: ["peter and benjamin have a feast episode four the harvest feast"],
}

SENT_RE = re.compile(
    r"id:'(?P<id>s\d+)',\s*chapter:(?P<ch>\d+),\s*"
    r'en:"(?P<en>(?:[^"\\]|\\.)*)",\s*'
    r'zh:"(?P<zh>(?:[^"\\]|\\.)*)",\s*'
    r"start:(?P<st>[-\d.]+),\s*end:(?P<en2>[-\d.]+)\s*\}"
)

CHUNK_SEC = 30.0
PAD_SEC = 0.5
STRIDE = 0.02  # MMS_FA emission step (validated)
SR = 16000
LEAD_PAD = 0.08   # tiny lead so the onset is not clipped
TAIL_PAD = 0.06
NEIGHBOR_GAP = 0.03
MIN_DUR = 0.4


def unescape_js(text: str) -> str:
    return text.replace('\\"', '"').replace("\\\\", "\\")


def parse_sentences(html: str) -> list[dict]:
    out: list[dict] = []
    for m in SENT_RE.finditer(html):
        out.append(
            {
                "id": m["id"],
                "chapter": int(m["ch"]),
                "en": unescape_js(m["en"]),
                "zh": unescape_js(m["zh"]),
                "start": float(m["st"]),
                "end": float(m["en2"]),
            }
        )
    return out


def compute_emission(model, wav_path: str, dur: float):
    """Stitch ~30s emission chunks into one absolute-frame emission tensor."""
    import torch
    import torchaudio

    cores = []
    t = 0.0
    while t < dur:
        core_start, core_end = t, min(t + CHUNK_SEC, dur)
        a = max(0.0, core_start - PAD_SEC)
        b = min(dur, core_end + PAD_SEC)
        wf, _ = torchaudio.load(
            wav_path, frame_offset=int(a * SR), num_frames=int((b - a) * SR)
        )
        with torch.inference_mode():
            em, _ = model(wf)
        em = em[0]
        left_drop = int(round((core_start - a) / STRIDE))
        core_len = int(round((core_end - core_start) / STRIDE))
        cores.append(em[left_drop : left_drop + core_len])
        t += CHUNK_SEC
        print(f"  emission {core_end:6.1f}/{dur:.1f}s", file=sys.stderr)
    return torch.cat(cores, dim=0)


def load_chapter_anchors(sentences_json: str | None) -> dict[int, list[str]]:
    """Per-video anchors from the sentences JSON, else Harvest Feast defaults."""
    if sentences_json and Path(sentences_json).exists():
        data = json.loads(Path(sentences_json).read_text(encoding="utf-8"))
        raw = data.get("chapter_anchors")
        if raw:
            return {int(k): list(v) for k, v in raw.items()}
    return DEFAULT_CHAPTER_ANCHORS


def align(html: str, wav_path: str, chapter_anchors: dict[int, list[str]]):
    import torch
    import torchaudio
    import torchaudio.functional as F

    sents = parse_sentences(html)
    if not sents:
        sys.exit("No DEFAULT_SENTENCES parsed from HTML")
    chapters = sorted({s["chapter"] for s in sents})

    bundle = torchaudio.pipelines.MMS_FA
    dictionary = bundle.get_dict()
    model = bundle.get_model()

    info = torchaudio.info(wav_path)
    dur = info.num_frames / info.sample_rate
    cache = Path(wav_path).with_suffix(".emission.pt")
    if cache.exists():
        print(f"Loading cached emission: {cache}", file=sys.stderr)
        emission = torch.load(cache)
    else:
        print(f"Audio {dur:.1f}s; computing stitched emission...", file=sys.stderr)
        emission = compute_emission(model, wav_path, dur)
        torch.save(emission, cache)
        print(f"Cached emission: {cache}", file=sys.stderr)
    n_frames = emission.shape[0]
    print(
        f"emission frames={n_frames} (~{n_frames * STRIDE:.1f}s)", file=sys.stderr
    )

    raw_lo, raw_hi = {}, {}
    for c in chapters:
        cs = [s for s in sents if s["chapter"] == c]
        raw_lo[c] = min(s["start"] for s in cs)
        raw_hi[c] = max(s["end"] for s in cs)

    # The MMS dict uses '-' as blank and '*' as star; never feed those as
    # targets (forced_align rejects the blank index). Drop hyphens so e.g.
    # "Good-bye" aligns as "goodbye".
    allowed = {ch for ch in dictionary if ch not in ("-", "*")}

    def norm_chars(word: str) -> list[str]:
        return [ch for ch in word.lower() if ch in allowed]

    aligned: dict[str, tuple[float, float]] = {}
    for ci, c in enumerate(chapters):
        cs = [s for s in sents if s["chapter"] == c]
        w0 = 0.0 if ci == 0 else max(0.0, raw_hi[chapters[ci - 1]] - 0.5)
        w1 = dur if ci == len(chapters) - 1 else raw_hi[c] + 4.0
        f_lo = max(0, int(round(w0 / STRIDE)))
        f_hi = min(n_frames, int(round(w1 / STRIDE)))
        em = emission[f_lo:f_hi].unsqueeze(0)

        words: list[list[str]] = []
        owners: list[tuple[str, str | None]] = []
        for anchor in chapter_anchors.get(c, []):
            for w in anchor.split():
                ch = norm_chars(w)
                if ch:
                    words.append(ch)
                    owners.append(("anchor", None))
        for s in cs:
            for w in s["en"].split():
                ch = norm_chars(w)
                if ch:
                    words.append(ch)
                    owners.append(("sent", s["id"]))

        flat = [dictionary[ch] for ws in words for ch in ws]
        targets = torch.tensor([flat], dtype=torch.int32)
        aligned_tokens, scores = F.forced_align(em, targets, blank=0)
        spans = F.merge_tokens(aligned_tokens[0], scores[0].exp())
        if len(spans) != len(flat):
            sys.exit(
                f"chapter {c}: span/target mismatch {len(spans)} != {len(flat)}"
            )

        word_times: list[tuple[float, float]] = []
        i = 0
        for ws in words:
            grp = spans[i : i + len(ws)]
            i += len(ws)
            st = (f_lo + grp[0].start) * STRIDE
            en = (f_lo + grp[-1].end) * STRIDE
            word_times.append((st, en))

        for s in cs:
            idxs = [k for k, o in enumerate(owners) if o == ("sent", s["id"])]
            if idxs:
                aligned[s["id"]] = (
                    word_times[idxs[0]][0],
                    word_times[idxs[-1]][1],
                )
        print(f"chapter {c}: aligned {len(cs)} sentences", file=sys.stderr)

    order = [s["id"] for s in sents]
    final: dict[str, tuple[float, float]] = {}
    for i, sid in enumerate(order):
        s = next(x for x in sents if x["id"] == sid)
        if sid not in aligned:
            final[sid] = (round(s["start"], 2), round(s["end"], 2))
            continue
        st, en = aligned[sid]
        st = max(0.0, st - LEAD_PAD)
        en = en + TAIL_PAD
        if i + 1 < len(order) and order[i + 1] in aligned:
            en = min(en, aligned[order[i + 1]][0] - NEIGHBOR_GAP)
        if en - st < MIN_DUR:
            en = st + MIN_DUR
        final[sid] = (round(st, 2), round(en, 2))
    return sents, final


def write_outputs(html_path: Path, html: str, sents: list[dict], final, json_path, srt_path):
    for s in sents:
        ns, ne = final[s["id"]]
        pat = re.compile(rf"(id:'{re.escape(s['id'])}',.*?start:)[-\d.]+(,\s*end:)[-\d.]+")
        html = pat.sub(lambda m: f"{m.group(1)}{ns}{m.group(2)}{ne}", html, count=1)
    html_path.write_text(html, encoding="utf-8")
    print(f"Wrote HTML: {html_path}", file=sys.stderr)

    if json_path and Path(json_path).exists():
        data = json.loads(Path(json_path).read_text(encoding="utf-8"))
        for sj in data.get("sentences", []):
            if sj["id"] in final:
                sj["start"], sj["end"] = final[sj["id"]]
        Path(json_path).write_text(
            json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"Wrote sentences JSON: {json_path}", file=sys.stderr)

    if srt_path:
        from subtitle_utils import sentences_to_srt

        srt_sents = [
            {"en": s["en"], "start": final[s["id"]][0], "end": final[s["id"]][1]}
            for s in sents
        ]
        Path(srt_path).write_text(sentences_to_srt(srt_sents) + "\n", encoding="utf-8")
        print(f"Wrote SRT: {srt_path}", file=sys.stderr)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--html", required=True)
    ap.add_argument("--wav", required=True)
    ap.add_argument("--sentences-json")
    ap.add_argument("--srt")
    ap.add_argument("--apply", action="store_true", help="write files (else dry run)")
    args = ap.parse_args()

    html_path = Path(args.html)
    html = html_path.read_text(encoding="utf-8")
    chapter_anchors = load_chapter_anchors(args.sentences_json)
    sents, final = align(html, args.wav, chapter_anchors)

    moved = 0
    for s in sents:
        ns, ne = final[s["id"]]
        d = ns - s["start"]
        flag = "  <== MOVED" if abs(d) > 0.6 else ""
        if flag:
            moved += 1
        print(
            f"{s['id']:>5} ch{s['chapter']} "
            f"{s['start']:7.2f}->{ns:7.2f}  end {s['end']:7.2f}->{ne:7.2f}  "
            f"{s['en'][:42]}{flag}"
        )
    print(f"\n{moved}/{len(sents)} sentences moved >0.6s", file=sys.stderr)

    if not args.apply:
        print("DRY RUN: no files written. Re-run with --apply.", file=sys.stderr)
        return 0
    write_outputs(html_path, html, sents, final, args.sentences_json, args.srt)
    print("Applied.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
