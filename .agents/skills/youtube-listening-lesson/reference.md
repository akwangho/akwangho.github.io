# Reference — DEFAULT_SENTENCES 與章節

## sentences JSON 格式

```json
{
  "chapters": [
    { "chapter": 0, "label": "第一集：採集堅果", "emoji": "🌰" },
    { "chapter": 1, "label": "第二集：找小偷", "emoji": "🕵️" }
  ],
  "sentences": [
    {
      "id": "s1",
      "chapter": 0,
      "en": "Little Fox.",
      "zh": "小狐狸頻道。",
      "start": 0.37,
      "end": 3.32
    }
  ]
}
```

- `chapter`：0 起算，對應按鈕 `data-v="0"`…
- **start** / **end**：秒（浮點）；優先用 word timestamps 首末字，不是 Whisper segment 邊界
- **en**：Whisper 逐字合併 → `normalize_spoken_line()` 整句修正（含 `Cried the farmer` → `he said/cried`）；HTML 內 `\"` 逸出雙引號
- `zh`：繁體中文，引號「」，內層『』
- **重轉後**：舊 `segments` 索引失效 → 用 `remap_sentence_map()` 或 `spoken_from_token_sequence()`

## 章節分段

依 Episode / 集數標題句切換 `chapter`：

- `Episode One` / `Episode 1` / `第一集` → chapter 0 的標題句（或切到 chapter 1 的開頭，依故事結構一致即可）
- Little Fox 多集動畫：通常每個 `Episode N` 標題開新 chapter
- 單集故事：整篇 `chapter: 0`，只保留一個章節按鈕 +「全部」

## 略過不納入 DEFAULT_SENTENCES

- `[Music]`、`[Laughter]`、`[Applause]`
- 明顯不完整（以 `—`、`...` 結尾且下一句接續）
- 純音效誤判（如 `Ha ha ha ha` 可併入上一句對白）

## 檔名規則

| 類型 | 格式 |
|------|------|
| HTML | `eng/YYYY-MM-DD-{slug}.html` |
| SRT | `eng/sub/YYYY-MM-DD-{slug}.srt` |
| slug | 英文連字號，無空白、`'`、`&` |

## HTML 只改這些區塊

1. `<title>`
2. `<div class="brand">`
3. `<script>` 開頭註解（故事名、URL、字幕路徑）
4. `const VIDEO_ID`
5. `const DEFAULT_SENTENCES = [ ... ]`
6. `data-k="scope"` 與 `data-k="shadowScope"` 章節按鈕

## eng/index.html

在 `lessonList` **最前面**插入：

```js
{
    title: "卡片標題",
    href: "YYYY-MM-DD-slug.html",
    emoji: "🐰",
    date: "YYYY-MM-DD"
},
```

## Whisper 設定

- **預設模型**：`large-v3`（`transcribe-youtube.py`）；草稿可用 `--fast` → `medium.en`
- **逐字時間**：JSON 每段含 `words: [{word, start, end}]`；HTML `start`/`end` 取合併段內首末字
- **initial_prompt**：Little Fox / Peter Rabbit 角色名，提升對白準確度
- **對白修正**：用 `subtitle_utils.normalize_spoken_line`；禁止改成與發音不符的「漂亮英文」

## 對齊驗收

1. 含 `said` / `cried` / `farmer` 的句子逐句聽音比對
2. 確認無 `said farmer`、`Hello said farmer` 等 ASR 倒裝
3. 播放跟讀片段，字幕起訖應貼合該句發音

## 疑難排解

| 問題 | 處理 |
|------|------|
| yt-dlp 失敗 | 確認 URL、網路；必要時更新 `brew upgrade yt-dlp` |
| faster-whisper 安裝失敗 | Python 3.11 venv 重試 |
| 時間重疊 | 手動調整相鄰句 start/end；對白被拆太細則合併 |
| 專有名詞錯 | 加入 `transcribe-youtube.py` 的 `TEXT_REPLACEMENTS` |
