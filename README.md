# 讀心術師卡爾｜二進位與資料數位化（單機網頁版）

用讀心卡片認識二進位、文字、圖片與聲音的互動課程，取自 KUSU 酷書的課程活動。這個版本是純靜態網頁：

- 不用登入，沒有資料庫，也沒有伺服器程式。
- 進度只存在「這台電腦的這個瀏覽器」（localStorage），不會上傳到任何地方。換電腦、換瀏覽器、用無痕視窗或清除瀏覽資料，就會從頭開始。
- 右上角的「重新開始」會清除這台電腦上的進度。

## 和 KUSU 課堂版的差別

| 項目 | KUSU 課堂版 | 單機網頁版 |
| --- | --- | --- |
| 題目、提示、判分、計分 | 有 | 相同 |
| 每人不同的數字與選項順序、重刷練習 | 有 | 相同 |
| 帳號登入、換電腦繼續 | 有 | 沒有 |
| 全班排行、老師儀表板、老師評語 | 有 | 沒有 |

## 放到 GitHub Pages

### 用 GitHub CLI（gh）

先登入一次（會開瀏覽器讓你授權）：

```bash
gh auth login --hostname github.com --git-protocol https --web
```

在這個資料夾裡建立 repository 並上傳：

```bash
git init -b main
git add .
git commit -m "讀心術師卡爾 單機網頁版"
gh repo create mindreader-karl --public --source . --remote origin --push
```

開啟 GitHub Pages（把 `你的帳號` 換成 GitHub 帳號）：

```bash
gh api -X POST repos/你的帳號/mindreader-karl/pages -f "source[branch]=main" -f "source[path]=/"
```

### 用 GitHub 網站上傳

1. 在 GitHub 建立新的 repository（例如 `mindreader-karl`），設為 **Public**。
2. 在 repository 頁面按 **Add file → Upload files**，把這個資料夾裡的所有檔案連同 `images` 資料夾一起拖進去，再按 **Commit changes**。
3. 到 **Settings → Pages**：Source 選 **Deploy from a branch**，Branch 選 `main`，資料夾選 `/ (root)`，按 **Save**。
4. 等 1～2 分鐘，網址會是 `https://你的帳號.github.io/mindreader-karl/`。

也可以用 git 指令上傳（先在 GitHub 建好空的 repository）：

```bash
git init
git add .
git commit -m "讀心術師卡爾 單機網頁版"
git branch -M main
git remote add origin https://github.com/你的帳號/mindreader-karl.git
git push -u origin main
```

## 在自己電腦預覽

這個網頁使用 JavaScript 模組，直接雙擊 `index.html` 會無法載入。請在這個資料夾裡執行：

```bash
python -m http.server 8000
```

再用瀏覽器打開 `http://localhost:8000/`。

## 檔案說明

| 檔案 | 用途 |
| --- | --- |
| `index.html` | 頁面外框 |
| `app.js` | 課程畫面與操作 |
| `engine.js` | 判分、提示、計時與計分規則（與 KUSU 伺服器相同，進度改存在瀏覽器） |
| `content.js` | 題目內容（與 KUSU 課程版相同） |
| `course.css` | 樣式 |
| `images/` | 插圖 |
| `favicon.ico` | 分頁圖示 |
| `LICENSE` | 程式碼授權（MIT），並說明兩種授權各自涵蓋的範圍 |
| `LICENSE-CONTENT.md` | 課程內容與插圖授權（CC BY-NC-SA 4.0） |
| `.nojekyll` | 讓 GitHub Pages 原樣提供所有檔案 |

## 授權

- **程式碼**：MIT，見 `LICENSE`。任何人都可以使用、修改、散布，須保留版權與授權聲明。
- **課程內容與插圖**：CC BY-NC-SA 4.0，見 `LICENSE-CONTENT.md`。使用時要標示「讀心術師卡爾，KUSU 酷書，CC BY-NC-SA 4.0」、不得商業使用，改編後要用相同授權分享。

© 2026 KUSU 酷書

## 同步 KUSU 的題目更新

KUSU 課程的題目更新後，把 KUSU 的 `static/courses/mindreader/content.mjs` 複製過來覆蓋 `content.js`（內容相同，只有副檔名不同）。如果 KUSU 的課程畫面 `app.mjs` 也有修改，`app.js` 需要一起同步。
