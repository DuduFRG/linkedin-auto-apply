# Privacy and local data

## Summary

- All your data stays **on your computer**, inside your Chrome profile.
- This repository **does not and must never** contain personal data.
- The extension **makes no network requests of its own**. It only interacts with LinkedIn pages you already visit.

## Where data is stored

The extension writes exclusively to `chrome.storage.local`, a private storage area owned by the extension inside your Chrome profile folder. It is not synced to your Google account (`chrome.storage.sync` is never used), and other extensions and websites cannot read it.

| Key | Contents |
| --- | --- |
| `settings` | Language, job title, location, resume name, goals and pauses. |
| `profile` | Name, email, phone, city, links. |
| `answers` | Learned answer bank (question → answer). |
| `history` | Processed jobs: title, company, status and reason. |
| `run`, `control`, `pending`, `pendingAnswer` | Temporary state of the current run. |
| `log` | The latest 300 activity lines. |

Every write goes through a single module: [`extension/shared/storage.js`](../extension/shared/storage.js).

## Technical guarantees

- **No network:** `manifest.json` sets `connect-src 'none'` for extension pages. The side panel and the service worker cannot call `fetch` or `XMLHttpRequest`.
- **No remote code:** `script-src 'self'`. No external library, font or script is loaded.
- **Minimal permissions:** `storage`, `sidePanel`, `tabs`, `notifications`, and host access to `https://www.linkedin.com/*` only.
- **No data in code:** no name, email or answer lives in the repository. The only example, [`examples/answers.example.json`](../examples/answers.example.json), is fictional.
- **Defensive `.gitignore`:** exported backups (`applypilot-backup-*.json`), `answers.json`, `*.local.json`, `.env` and the `data/`, `exports/` and `backups/` folders are ignored by Git.

## Backup and migration

In the side panel, **Answers** tab:

- **Export** creates `applypilot-backup-YYYY-MM-DD.json` with settings, profile and answers.
- **Import** merges a backup into the current browser.

Treat that file as personal data. Do not keep it inside the repository folder (if you do, `.gitignore` blocks it by its default name).

## Deleting everything

Either:

1. In the panel: **Answers → Delete all answers** and **History → Clear**.
2. In `chrome://extensions`, remove the extension. Chrome deletes all of its `chrome.storage.local`.

## What LinkedIn sees

LinkedIn receives exactly what it would receive if you filled in the form by hand: the answers of each application you submit. The extension sends no additional information.

## Landing page

The project website (`site/`) is a static page hosted on GitHub Pages. It uses no cookies, no analytics and no third-party scripts. Fonts and images are self-hosted. GitHub may keep standard server logs as described in the [GitHub Privacy Statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement).
