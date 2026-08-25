---
name: career-ops
description: "Use when 求職、履歷、面試、104、職缺評估。Taiwan career-ops for Hermes."
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [career, jobs, resume, taiwan, 104, yes123]
    related_skills: [personal-info]
---

# career-ops — Hermes × 台灣求職

把 career-ops 當 **Skills + CLI** 用。不裝 MCP。專案在
`~/workspace/github/career-ops`。

主人說「找工作／掃職缺／評估這份 JD／改履歷／面試準備」就載這份。

## 台灣鐵律

1. **輸出繁中。** `config/profile.yml` 設 `language.output: zh-TW`、`language.modes_dir: modes/zh-TW`。
2. **可自動掃：** Yourator、數字人力銀行（yes123）。
3. **不可自動掃：** 104、1111、Cake 搜尋頁。它們有 Cloudflare 或沒有公開零認證 API。career-ops 不繞過 bot protection。主人貼 URL／JD → auto-pipeline。
4. **絕不送出應徵。** 只評估、產履歷、寫草稿。
5. **關鍵字只重述、不捏造。** 事實只來自 `cv.md`、`config/profile.yml`、`modes/_profile.md`、當下對話。

## 先做

```bash
cd ~/workspace/github/career-ops
node doctor.mjs --json
```

`onboardingNeeded=true` 就先走 onboarding（履歷、profile、portals），不要先掃。

台灣 portals：

```bash
cp templates/portals.taiwan.yml portals.yml
```

## CLI

一律在 repo 根目錄。預設 JSON／表格給人看時再加 `--summary`。

| 要做的事 | 命令 |
|---------|------|
| 掃職缺 | `node scan.mjs` |
| 健康檢查 | `node doctor.mjs --json` |
| 管道統計 | `node stats.mjs --summary` |
| 改狀態 | `node set-status.mjs <公司或報告#> <State>` |
| 產 PDF | `node generate-pdf.mjs`（要 Playwright Chromium） |

評估一份職缺：貼 URL 或 JD，然後讀

`modes/_shared.md` + `modes/_profile.md` + `modes/_custom.md`（若有）+ `modes/zh-TW/oferta.md` 或 `modes/auto-pipeline.md`

## Mode 對照

| 主人說 | Mode |
|--------|------|
| 貼 JD／職缺 URL | `auto-pipeline` |
| 掃／找職缺 | `scan` |
| 只評估、先不要 PDF | `oferta` |
| 履歷 PDF | `pdf` |
| 追蹤／投了沒 | `tracker` |
| 面試 | `interview` / `interview-prep` |
| 公司研究 | `deep` |
| 求職信 | `cover` |
| 信件草稿 | `email`（只寫、不寄） |

## 來源怎麼用

- **yes123（數字人力銀行）** — `provider: yes123`。關鍵字來自 `yes123.keywords` 或 `config/profile.yml` 的 `target_roles`。
- **Yourator** — `provider: yourator`。公開 `api/v4/jobs`，掃完整看板。
- **104 / 1111 / Cake** — 請主人貼職缺網址或內文。用 `web_extract` 或瀏覽器開單一頁拿 JD，再評估。不要寫掃描器去撞 Cloudflare。

## 禁止

- ❌ 為了掃 104 去繞 Cloudflare／假裝瀏覽器過 challenge
- ❌ 打 yes123 的 `/commonAPI/`、`/WEBAPI/`、`/admin/CoreAPI/`（robots 禁止）
- ❌ 自動送履歷、自動點應徵
- ❌ 裝 MCP
- ❌ 把 story-bank 裡沒標來源的數字當履歷事實
