# 熱量日誌

自用的 iPhone 網頁 App：記錄每天吃了多少熱量、蛋白質、碳水，以及運動、體重、體脂與肌肉量，算出每日熱量赤字或盈餘。

- 資料只存在手機上（沒有伺服器、沒有帳號）。
- 可以離線使用。
- 食物資料庫：衛生福利部食品藥物管理署「食品營養成分資料集」（共 2,155 種食物）。

---

## 一、放上網路（GitHub Pages，免費）

網址只放程式，你的紀錄不會上傳，別人打開同一個網址也只會看到他自己手機上的資料。

1. 到 <https://github.com> 註冊帳號（免費）。
2. 右上角「＋」→「New repository」，名稱填 `kcalapp`，選 **Public**，按「Create repository」。
3. 把這個資料夾上傳到該 repository（可以請 Claude 幫你用 git 上傳）。
4. 進入 repository 的「Settings」→ 左側「Pages」→「Branch」選 `main`、資料夾選 `/ (root)` → 「Save」。
5. 等 1～2 分鐘，網址會是：`https://你的帳號.github.io/kcalapp/`

## 二、裝到 iPhone

1. 用 **Safari** 打開上面的網址。
2. 點下方的「分享」按鈕 → 往下滑 → 「加入主畫面」。
3. 之後都從主畫面的「熱量日誌」圖示打開。

> Safari 分頁和主畫面 App 的資料是分開的，請只在主畫面 App 裡記錄。

## 三、備份（很重要）

資料只存在手機上，刪掉 App 或換手機時資料就會不見。

- 「設定」→「匯出備份檔」→ 選「儲存到檔案」→ 存到 iCloud 雲碟。
- 超過 7 天沒備份，首頁會提醒你。
- 換手機時：裝好 App → 第一個畫面選「從備份檔還原」。
- 「匯出 CSV」可以用 Excel 開啟查看，但不能用來還原。

---

## 給之後修改程式的人

沒有建置步驟，全部是純 HTML / CSS / JavaScript，直接放上網站就能用。

| 位置 | 內容 |
|---|---|
| `index.html` | 入口 |
| `css/app.css` | 樣式（最上方是顏色、字級、間距等設計參數） |
| `js/main.js` | 分頁切換、新版本偵測 |
| `js/calc.js` | 基礎代謝、每日消耗、赤字／盈餘、每週總結的計算 |
| `js/store.js`、`js/db.js` | 資料存取（IndexedDB） |
| `js/views/` | 各畫面：今天、趨勢、身體、設定、新增紀錄、第一次使用 |
| `js/backup.js` | 匯出、匯入、備份提醒 |
| `data/foods.json` | 食物資料庫 |
| `sw.js` | 離線快取 |
| `tools/` | 產生食物資料庫與圖示的工具 |

**發佈新版本**：修改程式後，把 `sw.js` 和 `js/config.js` 裡的 `VERSION` 改成新的號碼（例如 `1.0.1`），再上傳。手機打開 App 時會出現「有新版本」提示。

**改 App 名稱**：`js/config.js` 的 `APP_NAME`、`index.html` 的 `<title>` 與 `apple-mobile-web-app-title`、`manifest.webmanifest` 的 `name` 與 `short_name`。已經加到主畫面的圖示名稱，需要刪掉後重新「加入主畫面」才會更新（先備份！）。

**更新食物資料庫**：

```
# 1. 下載 https://data.fda.gov.tw/opendata/exportDataList.do?method=ExportData&InfoId=20&logType=2 並解壓縮
# 2. 轉檔
python tools/build_foods.py 20_2.csv data/foods.json
```

**重新產生圖示**：`python tools/make_icons.py`（需要 Pillow）

**本機預覽**：在這個資料夾執行 `python -m http.server 8765`，用瀏覽器打開 <http://127.0.0.1:8765/>。

### 計算規則（已和使用者確認）

- 基礎代謝：有近 90 天的體脂紀錄時用 Katch-McArdle，否則用 Mifflin-St Jeor（可在設定改成固定公式或手動輸入）。
- 每日消耗 = 基礎代謝 × 活動係數。係數已包含運動，**運動紀錄不另外加進每日消耗**。
- 每天的計算使用「當天或之前最近一次」的體重與體脂，以及當天所屬目標階段的活動係數。
- 沒有飲食紀錄、或標記「只記了一部分」的日子，以及還沒結束的今天，都不列入統計。
- 理論體重變化：每公斤約 7,700 大卡。
