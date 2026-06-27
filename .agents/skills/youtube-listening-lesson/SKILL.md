---
name: youtube-listening-lesson
description: >-
  Transcribes YouTube videos with faster-whisper, writes SRT subtitles, and scaffolds
  new eng/ listening-lesson HTML pages (DEFAULT_SENTENCES + chapter buttons + eng/index.html).
  Use when the user pastes a YouTube link, asks to auto-generate subtitles, create a new
  聽力闖關 page, or add a Little Fox / English story lesson from video.
---

# YouTube → 聽力闖關頁

從 YouTube 連結自動轉字幕，並依 [`AGENTS.md`](../../AGENTS.md) 規格產生新的 `eng/*.html` 聽力闖關頁。

## 觸發情境

使用者貼上 YouTube URL，或說「幫這支影片做聽力教材 / 自動產生字幕 / 新增闖關頁」。

## 前置條件（本機一次安裝）

```bash
brew install yt-dlp ffmpeg
pip3 install faster-whisper
```

暫存目錄 `scripts/.cache/` 已在 `.gitignore`。

## 一鍵腳本（貼連結後先跑這個）

向使用者確認：**標題**、**slug**（英文連字號）、**emoji**（卡片用）。然後：

```bash
python3 scripts/create-listening-lesson.py \
  --url "https://www.youtube.com/watch?v=VIDEO_ID" \
  --title "故事中文標題" \
  --slug "English-Story-Slug" \
  --emoji "🐰" \
  --brand "🐰 故事標題" \
  --include-channel-intro
```

產出：
| 檔案 | 說明 |
|------|------|
| `eng/sub/YYYY-MM-DD-{slug}.srt` | Whisper 英文字幕 |
| `scripts/.cache/{id}.json` | 原始 segments |
| `scripts/.cache/{id}-sentences-draft.json` | 草稿句子（**zh 空白**） |
| `eng/YYYY-MM-DD-{slug}.html` | 從最新範本複製，已換 VIDEO_ID / title |
| `eng/index.html` | 已插入 lessonList 卡片 |

## Agent 必做：潤飾句子 + 繁中翻譯

腳本只做機械步驟；**合併碎片、修正 ASR、寫 zh 由 Agent 完成**。

1. 讀 `scripts/.cache/{id}-sentences-draft.json`
2. 對照 Whisper JSON，修正 `en`（完整句、標點、引號 `\"`、專有名詞）
3. 略過 `[Music]`、不完整殘句（如 `"They need—"`）
4. 為每句填 `zh`（繁體、引號「」、全形標點）
5. 設定 `chapters` 陣列（章節按鈕標籤），`chapter` 從 0 起算
6. 存成 `scripts/.cache/{id}-sentences.json`

合併規則與 HTML 欄位詳見 [reference.md](reference.md)。

### 常見 ASR 修正

- `Timmy tiptoes` → `Timmy Tiptoes`
- `Silver tail` → `Silvertail`
- `Fishes!`（誤聽）→ `These nut pies are delicious!`（依上下文）
- 多段對白合併：`"No," Peter said.` + `We collected these nuts.` → 一句

## 寫入 HTML

```bash
python3 scripts/patch-lesson-html.py \
  --html "eng/YYYY-MM-DD-{slug}.html" \
  --sentences-json "scripts/.cache/{id}-sentences.json" \
  --srt-path "eng/sub/YYYY-MM-DD-{slug}.srt" \
  --video-url "https://www.youtube.com/watch?v=VIDEO_ID"
```

會更新：`DEFAULT_SENTENCES`、測驗/跟讀的章節按鈕（`scope` + `shadowScope`）、script 註解。

**不要改** `DEFAULT_SENTENCES` 之後的引擎 JS。

## 驗收清單

```
- [ ] VIDEO_ID、title、brand 無舊故事殘留
- [ ] DEFAULT_SENTENCES id 連續 s1…sN
- [ ] 每句 en 完整；zh 已填
- [ ] start/end 與影片對齊（抽查 5–10 句）
- [ ] 章節按鈕數量 = chapters 數 +「全部」
- [ ] eng/index.html href 與檔名一致
- [ ] 不修改根目錄 index.html
```

## 腳本一覽

| 腳本 | 用途 |
|------|------|
| `scripts/create-listening-lesson.py` | 主流程：轉錄 + 複製範本 + index |
| `scripts/transcribe-youtube.py` | 僅轉錄 SRT/JSON |
| `scripts/merge-whisper-segments.py` | 草稿句子（可單獨重跑） |
| `scripts/patch-lesson-html.py` | 注入句子與章節按鈕 |

## 範本

預設範本：`eng/2026-06-27-Peter-Rabbit-Benjamin-Harvest-Feast.html`  
可用 `--template eng/2026-06-04-Cat-and-Cow-Learn-About-Friendship.html` 覆寫。

完整範例見 [examples.md](examples.md)。

## 僅更新既有頁字幕

已有 HTML，只需重轉字幕：

```bash
python3 scripts/transcribe-youtube.py \
  --video-id VIDEO_ID \
  --output-srt "eng/sub/....srt" \
  --json "scripts/.cache/VIDEO_ID.json"
```

再依新 JSON 更新 sentences JSON → `patch-lesson-html.py`。
