# AGENTS.md — 給 AI 看的專案規則

這是一個 GitHub Pages 靜態網站，內容是給小朋友的英語聽力 / 閱讀互動教材。
沒有建置流程（no build step）；每個頁面都是單一檔案的 HTML（內含 CSS + JS + 字幕資料），直接用瀏覽器開啟即可。

## 專案結構

- `index.html` — 首頁，列出「**根目錄**」的英語故事聽力 / 閱讀測驗頁（卡片是寫死在 HTML 中的 `<a class="story-card">`）。
- `eng/` — 互動「**聽力闖關**」教材頁（影片 + 跟讀 + 測驗三合一引擎）。
- `eng/index.html` — `eng/` 資料夾的索引頁；課程清單由 `<script>` 內的 `lessonList` 陣列渲染。
- `eng/sub/` — 字幕檔（`.srt`），檔名格式 `YYYY-MM-DD-<標題>.srt`。
- `eng/2026-06-27-Peter-Rabbit-Benjamin-Harvest-Feast.html`、`eng/2026-06-04-Cat-and-Cow-Learn-About-Friendship.html` — 最新的聽力闖關頁，可直接當作**引擎範本**。
- `.agents/skills/youtube-listening-lesson/` — **YouTube 連結 → Whisper 字幕 → 新聽力闖關頁** 的 Agent Skill；腳本在 `scripts/create-listening-lesson.py`。

## 任務：依影片 + 字幕「新增一個聽力闖關故事頁」

當使用者要求「依據某個 `eng/*.html` 檔，用某個 YouTube 影片 + 某個 `.srt` 字幕，重新做一個新故事頁」時，按以下步驟執行：

### 1. 複製範本
- 以使用者指定的（或最新的）`eng/*.html` 作為引擎範本，複製成新檔。
- 新檔放在 `eng/` 底下，**檔名開頭必須是今天日期**：`eng/YYYY-MM-DD-<英文-slug>.html`（slug 用連字號，避免空白與 `'`、`&` 等特殊字元，方便當作 URL / href）。

### 2. 只修改「故事專屬」的部分，不要動引擎 JS
範本的下半部（`DEFAULT_SENTENCES` 之後的所有函式）是通用引擎，**不要改**。只需替換這幾處：

1. `<title>...</title>`（瀏覽器分頁標題）。
2. `<div class="brand">...</div>`（左上角標題）。
3. `<script>` 開頭的註解區塊：更新故事名、影片網址、字幕路徑、各章節說明。
4. `const VIDEO_ID = '...';` — 改成 YouTube 影片 ID（`watch?v=` 後面那段，例如 `ueIkpeMWPYQ`）。
5. `const DEFAULT_SENTENCES = [ ... ];` — 換成新故事的句子資料（見下方規格）。
6. **範圍 / 章節按鈕**：頁面有兩組 `data-k="scope"` 與 `data-k="shadowScope"` 的 `<button>`。請依故事的章節（集數）數量增減按鈕，`data-v` 從 `0` 開始對應 `chapter` 值，並保留 `data-v="all"`（全部）。

### 3. `DEFAULT_SENTENCES` 句子資料規格
陣列每一筆格式如下：

```js
{ id:'s1', chapter:0, en:"English sentence.", zh:"中文翻譯。", start:12.34, end:15.67 },
```

- `id`：`s1`、`s2`… 連續且唯一。
- `chapter`：**0 起算的整數**，代表第幾個章節 / 集（episode / section）。範圍按鈕的 `data-v` 必須與此對應。
- `en`：**完整句子**。SRT 常把一句拆成多行碎片，要把碎片**合併成完整句子**（含完整標點與引號）。句中的雙引號要逸出成 `\"`。
- `zh`：繁體中文翻譯。引號用「」（內層用『』），標點用全形（：，。！？—）。
- `start` / `end`：該句在影片中的起訖秒數（浮點數），盡量對齊 SRT 時間，讓「跟讀」「測驗」播放片段時聽到對應句子。

要點：
- 略過純 `[Music]`、`[Laughter]` 以及不完整的殘句（例如被打斷的 `"They need—"`）。
- 影片片頭的頻道名 / 集數標題可保留為前幾句（當作暖身），但不是必須。
- 句子依影片時間順序排列；`chapter` 依集數分段。

### 4. 更新 `eng/index.html`
在 `<script>` 的 `lessonList` 陣列**最前面**新增一筆，讓首頁能點進新頁：

```js
{
    title: "顯示在卡片上的標題",
    href: "YYYY-MM-DD-<英文-slug>.html",  // 相對 eng/ 的路徑
    emoji: "🐰",
    date: "YYYY-MM-DD"
},
```

### 5. 收尾檢查
- 用搜尋確認新檔內**沒有殘留範本舊故事的字串**（舊標題、舊 `VIDEO_ID`、舊章節名等）。
- 確認沒有 linter 錯誤。
- `href` 與實際檔名一致（注意大小寫與特殊字元）。
- 注意：`index.html`（根目錄）與 `eng/index.html` 是**兩份不同的索引**。`eng/` 底下的新頁只需更新 `eng/index.html`；除非新頁放在根目錄，否則不要動根目錄的 `index.html`。
