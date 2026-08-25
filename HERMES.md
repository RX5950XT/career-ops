@AGENTS.md

<!-- Hermes-specific notes. Shared rules live in AGENTS.md. -->

# Hermes Agent

career-ops 在 Hermes 上跟 Claude Code / Codex 同一套規則：讀 `AGENTS.md`、走 `modes/`、用 `node *.mjs`。不裝 MCP。

## 怎麼叫

- 互動：在 repo 根目錄跑 `hermes`，用自然語言叫 mode（「掃職缺」「評估這份 JD」）。
- Headless：`hermes chat -q "Run the career-ops scan mode and summarize new matches."`
- Telegram：載入 skill `career-ops`，工作目錄設成這個 repo。

Hermes 沒有保證的 `/career-ops` slash。用跟 Codex 一樣的白話：

```text
Evaluate this JD with career-ops auto-pipeline: https://www.yes123.com.tw/wk_index/job.asp?...
Run the career-ops scan mode and summarize new matches.
Run the career-ops tracker mode and summarize the current statuses.
```

## 這個 fork 的台灣預設

- 對外文字：`language.output: zh-TW`
- 市場規則：`language.modes_dir: modes/zh-TW`
- 可掃描：Yourator（公開 JSON）、數字人力銀行 yes123（公開列表頁）
- 不可掃描：104、1111、Cake 搜尋頁 — Cloudflare / 無公開零認證 API。貼 URL 或 JD 走 auto-pipeline。

掃描設定範本：`templates/portals.taiwan.yml` → 複製成 `portals.yml`。
