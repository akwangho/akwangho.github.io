---
name: youtube-listening-lesson
description: >-
  Transcribes YouTube videos with faster-whisper (large-v3, word-level timestamps),
  writes aligned SRT subtitles, and scaffolds eng/ listening-lesson HTML pages.
  Use when the user pastes a YouTube link, asks to auto-generate subtitles, fix
  subtitle/audio misalignment, or create a 聽力闖關 page from Little Fox stories.
---

# YouTube → 聽力闖關頁

從 YouTube 連結自動轉字幕，並依 [`AGENTS.md`](../../AGENTS.md) 規格產生新的 `eng/*.html` 聽力闖關頁。

## 核心原則：字幕必須對齊發音

**每一句 `en` 必須是影片實際說出的英文**，時間軸用 **word-level timestamps**（首字 start、末字 end）。

常見 Whisper 錯誤（必修正或重轉）：
- 對白順序顛倒：`Where is that rabbit, said the farmer` → 聽到的是 `"Where is that rabbit?" he said.`
- 主詞錯誤：`said farmer` / `Hello said farmer` → 應為 `he said` / `the farmer said`
- 碎片：`said the bunnies.` 應併入前句

**不要**把 Whisper 原文改寫成「文法較漂亮但發音不同」的句子；合併片段時保留 spoken words。

## 前置條件

```bash
brew install yt-dlp ffmpeg
pip3 install faster-whisper
```

## 轉錄（預設 large-v3 + 逐字時間）

```bash
python3 scripts/transcribe-youtube.py \
  --video-id VIDEO_ID \
  --output-srt "eng/sub/YYYY-MM-DD-slug.srt" \
  --json "scripts/.cache/VIDEO_ID.json"
```

已有快取音訊時加 `--skip-download`。

| 參數 | 說明 |
|------|------|
| 預設 `large-v3` + `int8`（CPU） | 準確度優先；GPU 可用 `float32` |
| `--fast` | 改用 `medium.en`（草稿用） |
| JSON 內 `words[]` | 每字 `{word,start,end}` |
| `initial_prompt` | Little Fox / Peter Rabbit 詞彙提示 |

共用工具：[`scripts/subtitle_utils.py`](../../scripts/subtitle_utils.py)（逐字對齊、對白正規化）

## 一鍵建立新頁

```bash
python3 scripts/create-listening-lesson.py \
  --url "https://www.youtube.com/watch?v=VIDEO_ID" \
  --title "故事中文標題" \
  --slug "English-Story-Slug" \
  --emoji "🐰" \
  --brand "🐰 故事標題" \
  --include-channel-intro
```

## Agent 必做：合併 + 繁中 + 對齊驗收

1. 讀 `scripts/.cache/{id}.json`（含 `words`）
2. **重轉後 segment 索引會變** — 勿沿用舊 `SENTENCE_MAP` 的 `segments` 數字；用 `remap_sentence_map()` 或逐字 token 對齊
3. 合併片段為教學句；`en` = Whisper 逐字合併後再 `normalize_spoken_line()`（**整句**做一次，含多段拼接）
4. **`start`/`end` 用 `range_bounds` 或 `spoken_from_token_sequence`**（word 首尾時間）
5. 填 `zh`（繁體、「」引號）
6. 設定 `chapters`（0 起算）
7. 存 `scripts/.cache/{id}-sentences.json` + 用 `sentences_to_srt()` 寫 SRT

### 對白正規化（必做）

Whisper 常把 Little Fox 旁白說的 `he said` 辨成 `Cried the farmer` / `said farmer`。`normalize_spoken_line()` 規則：

- `Stop! Thief! Cried the farmer.` → `"Stop! Thief!" he cried.`
- `Where is that rabbit? Cried the farmer.` → `"Where is that rabbit?" he said.`
- `Whispered Benjamin.` → `"…" Benjamin whispered.`
- **禁止**改寫成文法漂亮但發音不同的句子

### 對齊驗收（必做）

抽查 5–10 句，尤其含 `said` / `cried` / `farmer` 的對白：
- [ ] 字幕每個字與聽到的發音一致（不是文法改寫版）
- [ ] 播放片段時句子在正確時間出現/結束
- [ ] 無 `said farmer` 這類 ASR 倒裝殘句

## 寫入 HTML

```bash
python3 scripts/patch-lesson-html.py \
  --html "eng/YYYY-MM-DD-slug.html" \
  --sentences-json "scripts/.cache/{id}-sentences.json" \
  --srt-path "eng/sub/YYYY-MM-DD-slug.srt" \
  --video-url "https://www.youtube.com/watch?v=VIDEO_ID"
```

**不要改** `DEFAULT_SENTENCES` 之後的引擎 JS。

## 既有頁重轉字幕

```bash
python3 scripts/transcribe-youtube.py \
  --video-id VIDEO_ID \
  --skip-download \
  --output-srt "eng/sub/....srt" \
  --json "scripts/.cache/VIDEO_ID.json"

python3 scripts/build-{story}-sentences.py   # 或更新 sentences JSON
python3 scripts/patch-lesson-html.py ...
```

## 腳本一覽

| 腳本 | 用途 |
|------|------|
| `scripts/transcribe-youtube.py` | large-v3 轉錄 + word JSON + SRT |
| `scripts/subtitle_utils.py` | 逐字時間、對白正規化、`remap_sentence_map`、`sentences_to_srt` |
| `scripts/create-listening-lesson.py` | 新頁 scaffold |
| `scripts/patch-lesson-html.py` | 注入 DEFAULT_SENTENCES |

詳見 [reference.md](reference.md)、[examples.md](examples.md).
