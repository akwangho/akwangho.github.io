#!/usr/bin/env python3
"""Coverage auditor: find subtitle text in a video NOT covered by a cue list.

Useful for catching subtitles the extractor missed (e.g. lines that flashed by
too quickly for the change detector). It scans the subtitle band for bright
white glyphs, groups them into "text present" time segments, and reports any
segment that does not overlap an existing cue.

Usage:
    python audit.py VIDEO --sentences scripts/.cache/<id>-sentences.json \
        --crop-ratio 0.30 --fps 4 --out-dir output/audit
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cv2  # noqa: E402
import numpy as np  # noqa: E402

from extractor import frame_reader, video_info  # noqa: E402


def load_cues(path: Path) -> list[tuple[float, float]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    items = data["sentences"] if isinstance(data, dict) else data
    return [(float(s["start"]), float(s["end"])) for s in items]


def white_text_count(frame: np.ndarray, crop_ratio: float, white_thr: int) -> int:
    h, w = frame.shape[:2]
    top = int(h * (1.0 - crop_ratio))
    x0, x1 = int(w * 0.18), int(w * 0.82)  # subtitles live in the centre
    band = frame[top:h, x0:x1]
    gray = cv2.cvtColor(band, cv2.COLOR_BGR2GRAY)
    _, mask = cv2.threshold(gray, white_thr, 255, cv2.THRESH_BINARY)
    return int(np.count_nonzero(mask))


def covered(t, cues, tol):
    return any(cs - tol <= t <= ce + tol for cs, ce in cues)


def uncovered_segments(samples, cues, count_thr, min_dur, merge_gap, tol):
    """Group consecutive *uncovered* text frames into segments.

    Coverage is decided per-frame so a missed line wedged between two real cues
    is not absorbed by its neighbours.
    """
    flagged = [(t, c) for t, c in samples if c >= count_thr and not covered(t, cues, tol)]
    segs = []
    for t, c in flagged:
        if segs and t - segs[-1][1] <= merge_gap:
            segs[-1][1] = t
            segs[-1][2] = max(segs[-1][2], c)
        else:
            segs.append([t, t, c])
    return [s for s in segs if (s[1] - s[0]) >= min_dur or s[2] > count_thr * 3]


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("video")
    p.add_argument("--sentences", required=True)
    p.add_argument("--crop-ratio", type=float, default=0.30)
    p.add_argument("--fps", type=float, default=4.0)
    p.add_argument("--white-thr", type=int, default=200)
    p.add_argument("--count-thr", type=int, default=380)
    p.add_argument("--min-dur", type=float, default=0.4)
    p.add_argument("--merge-gap", type=float, default=0.7)
    p.add_argument("--tol", type=float, default=0.6)
    p.add_argument("--out-dir", default="output/audit")
    args = p.parse_args()

    cues = load_cues(Path(args.sentences))
    info = video_info.probe(args.video)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    samples = []
    frames_by_t = {}
    for fr in frame_reader.iter_frames(info, args.fps):
        c = white_text_count(fr.image, args.crop_ratio, args.white_thr)
        samples.append((round(fr.timestamp, 2), c))
        frames_by_t[round(fr.timestamp, 2)] = fr.image

    uncovered = uncovered_segments(
        samples, cues, args.count_thr, args.min_dur, args.merge_gap, args.tol
    )

    print(f"scanned {len(samples)} frames; {len(uncovered)} UNCOVERED text segments")
    for s in uncovered:
        mid = round((s[0] + s[1]) / 2, 2)
        # snapshot nearest sampled frame to the segment midpoint
        nearest = min(frames_by_t, key=lambda t: abs(t - mid))
        h, w = frames_by_t[nearest].shape[:2]
        top = int(h * (1.0 - args.crop_ratio))
        crop = frames_by_t[nearest][top:h, 0:w]
        name = out_dir / f"miss_{s[0]:07.2f}_{s[1]:07.2f}.png"
        cv2.imwrite(str(name), crop)
        print(f"  UNCOVERED {s[0]:7.2f} - {s[1]:7.2f}  peak={s[2]:6d}  -> {name.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
