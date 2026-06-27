# Example — Peter Rabbit（ueIkpeMWPYQ）

## 使用者輸入

```
https://www.youtube.com/watch?v=ueIkpeMWPYQ
幫我做聽力闖關頁
```

## Step 1：腳本 scaffold

```bash
python3 scripts/create-listening-lesson.py \
  --url "https://www.youtube.com/watch?v=ueIkpeMWPYQ" \
  --title "Peter Rabbit：豐收盛宴（堅果大謎團）" \
  --slug "Peter-Rabbit-Benjamin-Harvest-Feast" \
  --emoji "🐰" \
  --brand "🐰🌰 Peter Rabbit 豐收盛宴" \
  --page-title "Peter Rabbit 豐收盛宴 🐰🌰 聽力闖關" \
  --include-channel-intro
```

## Step 2：Agent 修正 draft

草稿常見問題（需手改 `sentences`）：

- `"My nuts, he asked."` → `"Are you stealing my nuts?" he asked.`
- `"They need a..."` + 下一句 → 合併為 `"They need lots of nuts."`
- `"Fishes!"` → `"These nut pies are delicious!"`（併入 Timmy 那句）
- 為 71 句補齊繁中（可參考既有 [`eng/2026-06-27-Peter-Rabbit-Benjamin-Harvest-Feast.html`](../../eng/2026-06-27-Peter-Rabbit-Benjamin-Harvest-Feast.html)）

`chapters` 範例：

```json
"chapters": [
  { "chapter": 0, "label": "第一集：採集堅果", "emoji": "🌰" },
  { "chapter": 1, "label": "第二集：找小偷", "emoji": "🕵️" },
  { "chapter": 2, "label": "第三集：銀尾巴", "emoji": "🐿️" },
  { "chapter": 3, "label": "第四集：豐收盛宴", "emoji": "🎉" }
]
```

存檔：`scripts/.cache/ueIkpeMWPYQ-sentences.json`

## Step 3：寫入 HTML

```bash
python3 scripts/patch-lesson-html.py \
  --html "eng/2026-06-27-Peter-Rabbit-Benjamin-Harvest-Feast.html" \
  --sentences-json "scripts/.cache/ueIkpeMWPYQ-sentences.json" \
  --srt-path "eng/sub/2026-06-27-Peter-Rabbit-and-Benjamin's-Harvest-Feast-The-Great-Nut-Myste.srt" \
  --video-url "https://www.youtube.com/watch?v=ueIkpeMWPYQ"
```

## 進階：僅重轉字幕

```bash
python3 scripts/transcribe-youtube.py \
  --video-id ueIkpeMWPYQ \
  --output-srt "eng/sub/2026-06-27-Peter-Rabbit-and-Benjamin's-Harvest-Feast-The-Great-Nut-Myste.srt" \
  --json "scripts/.cache/ueIkpeMWPYQ.json"
```

再更新 sentences JSON 時間軸 → `patch-lesson-html.py`。
