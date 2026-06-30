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

## 釜底抽薪校時：CTC 強制對齊（首選）

時間軸若漂移（句子起訖落在錯字、播放片段吃到下一句），**不要**靠 Whisper 逐字時間做模糊比對。改用 **強制對齊 (forced alignment)**：把「已知正確文本」＋音訊餵進聲學對齊器，直接得到每字精準時間，再取每句首/末字當 `start`/`end`。

實作：[`scripts/align-lesson.py`](../../scripts/align-lesson.py)，使用 `torchaudio` 的 CTC `forced_align`（MMS_FA 多語對齊模型）。**不需** stable-ts／openai-whisper（在 Intel mac + Python 3.13 上 torch 無法安裝，且 stable-ts 依賴 numba/llvmlite 難編譯）。

```bash
# 一次性：建立可裝 torch 的 venv（Intel mac 需 Python 3.11；torch 2.2.2 為最後支援版本）
python3.11 -m venv scripts/.cache/align-venv
scripts/.cache/align-venv/bin/pip install "torch==2.2.2" "torchaudio==2.2.2" "numpy<2"

# 用「HTML 內既有 DEFAULT_SENTENCES 文本」重新校時（先 dry-run 看報表，確認後加 --apply）
scripts/.cache/align-venv/bin/python scripts/align-lesson.py \
  --html eng/YYYY-MM-DD-slug.html \
  --wav scripts/.cache/VIDEO_ID.wav \
  --sentences-json scripts/.cache/VIDEO_ID-sentences.json \
  --srt eng/sub/YYYY-MM-DD-slug.srt \
  --apply
```

重點：
- 文本來源 = HTML 的 `DEFAULT_SENTENCES`（只重算 `start`/`end`，不動 `en`/`zh`/章節）。
- emission 以 ~30s 分段計算後拼接（wav2vec2 self-attention 是 O(T²)，整段會爆記憶體），快取於 `*.emission.pt`。
- 逐章 `forced_align`，並在每章首句前注入「片頭／各集標題」**錨點**（僅供對齊、不輸出時間），避免章節交界漂移。
- **每支影片的錨點不同**：在 sentences JSON 加 `"chapter_anchors": {"0": ["..."], ...}`（標題小寫、數字拼字、無標點），`align-lesson.py` 會自動讀取；未提供時用內建預設。
- 句末會夾到下一句起點，**不**吃到下一句。
- `-`（blank）與 `*`（star）為 MMS 特殊符號，token 化時必須剔除（如 `Good-bye` → `goodbye`）。

驗收見下方「對齊驗收」。

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

## Agent 必做：合併 + 繁中 + 對齊驗收 + 完整性稽核

1. 讀 `scripts/.cache/{id}.json`（含 `words`）
2. **重轉後 segment 索引會變** — 勿沿用舊 `SENTENCE_MAP` 的 `segments` 數字；用 `remap_sentence_map()` 或逐字 token 對齊
3. 合併片段為教學句；`en` = Whisper 逐字合併後再 `normalize_spoken_line()`（**整句**做一次，含多段拼接）
4. **`start`/`end` 用 `range_bounds` 或 `spoken_from_token_sequence`**（word 首尾時間）
5. 填 `zh`（繁體、「」引號）
6. 設定 `chapters`（0 起算）
7. 存 `scripts/.cache/{id}-sentences.json` + 用 `sentences_to_srt()` 寫 SRT
8. **`python3 scripts/audit-littlefox-srt.py {story} --audit-only`** — 確認無合併/遺漏；有問題則 `--apply`（不帶 `--audit-only`）修復

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

### 字幕完整性稽核（必做 — OCR/合併遺漏）

Whisper 或硬字幕 OCR 常把**連續對白合成一 cue**，導致像 `Silvertail bent deeper.` 整句消失。修正流程：

1. **對照 Little Fox 官方 supplement 台詞**（逐句一行）：
   - 例：[Harvest Feast Ep.4](https://www.littlefox.com/hk/supplement/org/C0007888)
   - 例：[Peter Rabbit Ep.1–4](https://www.littlefox.com/en/supplement/org/C0007023)
2. **跑稽核腳本**（只報告）：
   ```bash
   python3 scripts/audit-littlefox-srt.py all --audit-only
   ```
3. **套用已知修復並同步 SRT + HTML**：
   ```bash
   python3 scripts/audit-littlefox-srt.py harvest-feast   # 或 full-story / boot / all
   ```
4. **逐條驗收**：新增/拆分的 cue 在影片中各有一句發音；時間軸可先用相鄰 cue 間隙估算，再用 `align-lesson.py` 精修。
5. **繁中校對**：腳本以 OpenCC 轉繁體並統一譯名（如 `班傑明`）；繁中在 HTML `DEFAULT_SENTENCES`，SRT 僅英文。

支援 slug：`harvest-feast`、`full-story`、`boot`（見 `STORIES`）。

常見遺漏型態（必拆成獨立 cue）：

| 錯誤 | 正確（Little Fox） |
|------|-------------------|
| `"I don't see any nuts. Where are—Yikes!"` | 三句：`"I don't see any nuts."` → `Silvertail bent deeper.` → `"Where are—Yikes!"` |
| `"Yes!" …` 後直接跳場 | 補 `"Where are they?"` |
| `Peter pointed …` 後缺台詞 | 補 `"Right there."` |
| `"Help! I'm stuck in this net!" cried Peter.` | `"Help!" he cried.` + `"I'm stuck in this net!"` |
| 按鈕卡住後缺驚叫 | 補 `"Ahh!" he cried.` |
| 冰水場景 | 補 `"Brr!" said Peter.` |
| 貓場景 | 補 `"Whew!" whispered Peter.` |
| 找門場景 | 補 `Scritch, scratch!`（可與 `Peter heard a noise.` 各一 cue） |
| `"Oh no!" … "We must find Mrs. Tiggy-Winkle," …` 合併 | 各一 cue（Boot Ep.2） |
| `"We need that boot," … "Can we have it?"` 合併 | 各一 cue |

新故事：在 `scripts/audit-littlefox-srt.py` 的 `STORIES` / `REQUIRED_LINES` / `fix_*()` 加入對照表，或擴充 `REQUIRED_LINES` 後手動補 `fix_*` 規則。

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
| `scripts/align-lesson.py` | **CTC 強制對齊校時（首選）**：torchaudio MMS_FA，回填 HTML/JSON/SRT |
| `scripts/create-listening-lesson.py` | 新頁 scaffold |
| `scripts/patch-lesson-html.py` | 注入 DEFAULT_SENTENCES |
| `scripts/audit-littlefox-srt.py` | **字幕完整性稽核**：對照 Little Fox 台詞，偵測合併/遺漏，修復 SRT + HTML |

詳見 [reference.md](reference.md)、[examples.md](examples.md).
