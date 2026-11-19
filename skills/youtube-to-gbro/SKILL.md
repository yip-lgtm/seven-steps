---
name: youtube-to-gbro
description: Extract vocabulary from a YouTube video transcript and add it as a preloaded sample pack to gbro.html in the seven-steps repo. Use when the user shares a YouTube URL and wants it turned into a gbro vocabulary pack for 7劍下天山.
---

# YouTube → gbro 詞包 Workflow

當 user 分享 YouTube URL 並要求加入「詞學 gbro」時使用此 skill。

## 流程

1. **確認片子**
   - 用 browse_page 抽取標題、channel、描述同尽量多完整芬白/對話句子。
   - 如果是紀錄片、教學片或有清晰英語對話，繼續。純娛樂片先問 user 是否仍要做。

2. **抽詞彙**
   - 選 20–40 個適合學習的詞/短語。
   - 每個必須有完整英文原句（唔可截斷）。
   - 格式：word | gloss (中文釋義) | ipa (可空) | en (完整句) | zh (譯句)
   - 優先選自然對話、常見詞彙、有學習價值的表達。

3. **更新 gbro.html**
   - 用 github___get_file_contents 攚 gbro.html 及其 SHA。
   - 在 SAMPLES 陣列最前面加入新詞包（id 用短標題，例如 'iwo-jima'）。
   - 用 github___create_or_update_file 更新檔案（必須帶正確 branch 同 sha）。
   - commit message 寫清楚，例如 "Add [title] vocab pack to gbro.html samples"。

4. **回覆 user**
   - 給出 commit SHA 同直接連結：https://yip-lgtm.github.io/seven-steps/gbro.html
   - 提醒等 1–2 分鐘部署後硬刷新。
   - 如果詞包已存在，告訴 user 並問是否要覆蓋。

## 注意

- 保持現有詞包（D-Day、Hololive 等）不刪除。
- 句子必須完整，唔好用截斷的。
- 如果 transcript 抽不到尽，用可用部分做，並說明。
- 更新前先 get_file_contents 拿最新 SHA，避免 conflict。
