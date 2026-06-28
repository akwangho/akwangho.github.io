# Hard Subtitle Extractor

Extract **burned-in (hard) subtitles** from a video and export an accurate `.srt`
file. Runs completely offline, minimises OCR by detecting subtitle changes, and is
built as small, swappable modules.

## Pipeline

```
Video
  → Frame Reader (OpenCV, samples N fps via grab/retrieve)
  → Subtitle Region Crop (fixed bottom band, or auto)
  → Subtitle Change Detection (bright-text mask + absdiff + pixel count)
        ├─ no change → skip
        └─ changed   → OCR (PP-OCR models)
  → Text Cleaning + Normalization
  → Duplicate Detection (exact + RapidFuzz)
  → Subtitle Merge (accurate start/end)
  → SRT Writer
```

## Install

```bash
cd subtitle_extractor
python3 -m pip install -r requirements.txt
```

The default OCR engine is **RapidOCR** (`rapidocr-onnxruntime`), which runs the
same PP-OCR detection + recognition models as PaddleOCR through ONNX Runtime — no
`paddlepaddle` build required, so it works on macOS / Python 3.13. If a real
`paddleocr` install is importable it is used automatically.

## Usage

```bash
python3 main.py input.mp4 --output output.srt --fps 3 --lang en
```

| Option | Meaning | Default |
|--------|---------|---------|
| `--output PATH` | output `.srt` | `output/<name>.srt` |
| `--fps N` | frames per second to sample | `3` |
| `--crop ratio\|box\|auto` | subtitle crop mode | `ratio` |
| `--crop-ratio R` | bottom band fraction | `0.28` |
| `--lang en\|ch` | OCR language | `en` |
| `--gpu` | GPU OCR | off |
| `--merge-threshold N` | RapidFuzz % to merge cues | `90` |
| `--min-change N` | min changed pixels to OCR | `3000` |
| `--llm-correct` | LLM OCR correction (stub) | off |
| `--debug` | dump crops + OCR text to `output/debug/` | off |

All defaults live in [`config.yaml`](config.yaml) and can be overridden per run.

## Layout

```
subtitle_extractor/
├── main.py                 # CLI + pipeline wiring
├── config.py / config.yaml # typed config + defaults
├── extractor/              # video_info, frame_reader, crop
├── detector/               # frame_difference, similarity, subtitle_change_detector, region_detector
├── ocr/                    # paddle_ocr (PP-OCR engine), text_cleaner, text_normalizer, llm_corrector
├── subtitle/               # subtitle, duplicate_detector, subtitle_merger, srt_writer
├── utils/                  # logger, timer, image, config_loader
└── output/                 # generated SRT (+ debug/)
```

## Performance notes

* **Frame skipping** — only `fps` frames/second are decoded (`grab()` skips the rest).
* **Crop** — only the subtitle band is processed.
* **Change detection** — OCR only fires when the bright-text mask changes enough,
  which on a typical talking video skips OCR on the large majority of sampled
  frames. `minimum_change_pixels` is tuned to ignore the yellow karaoke highlight
  sweeping across an otherwise-unchanged line.

## Future enhancements (scaffolded, not enabled)

Automatic region detection (`detector/subtitle_region_detector.py`), LLM OCR
correction (`ocr/llm_corrector.py`), translation, GUI, and batch processing.
