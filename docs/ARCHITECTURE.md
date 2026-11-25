# Architecture

## Overview

```
┌──────────────────┐   runtime messages    ┌──────────────────────┐
│   Side panel     │ ────────────────────► │   Service worker     │
│  (sidepanel/)    │  START/PAUSE/RESUME/  │  (background/)       │
│                  │  STOP/FOCUS_TAB       │  owns the tab, badge,│
└───────┬──────────┘                       │  notifications       │
        │                                  └──────────┬───────────┘
        │       chrome.storage.local (single source of truth)
        └──────────────┬──────────────────────────────┘
                       │  settings · profile · answers · history
                       │  run · control · pending · pendingAnswer · log
               ┌───────┴──────────┐
               │  Content script  │  runs on www.linkedin.com,
               │  (content/)      │  acts only in the run's tab
               └──────────────────┘
```

`chrome.storage.local` doubles as the message bus. That makes the system resilient to:

- **Service worker shutdown** (Manifest V3 stops idle workers).
- **Page reloads:** every navigation is a full load; the content script reads state and continues where it left off.
- **A closed panel:** a question stays in `pending` until the panel is opened and answered.

## State ownership

| Key | Written by | Read by |
| --- | --- | --- |
| `control.state` (`idle`, `running`, `paused`) | Service worker (panel commands); content script when finishing or pausing on error | Content script (checkpoints), panel |
| `run` (phase, queue, current job, stats) | Content script; service worker on start | Panel, service worker (badge) |
| `pending` | Content script | Panel, service worker (notification) |
| `pendingAnswer` | Panel | Content script |
| `answers`, `profile`, `settings` | Panel and content script | Both |

Separating `control` (the user's intent) from `run` (automation progress) avoids races between the Pause button and progress updates.

## Internationalisation

`shared/i18n.js` holds every string in Portuguese, English and Spanish. The automation never stores translated text: it stores message objects such as `{ key: 'applyingTo', params: { title } }` in the log, history and run state. The panel and notifications translate them at render time, so switching language updates everything instantly, including past history. Static panel markup uses `data-i18n`, `data-i18n-ph`, `data-i18n-title` and `data-i18n-aria` attributes. `_locales/` translates the extension name and description shown by Chrome.

A unit test enforces that all three languages define the same keys and placeholders, and that every key used in code exists.

## Content script flow (`runner.js`)

Each page load performs **one step**, chosen by URL:

| URL | Action |
| --- | --- |
| `/jobs/search/...` | `Search.collect()` scrolls the list, collects ids, drops processed ones, saves the queue and opens the first job. |
| `/jobs/view/<id>/` | `EasyApply.run()` processes the job, records the result, waits and opens the next job (or the next results page). |
| Sign-in, checkpoint or captcha | Pauses with an attention status and notifies. |
| Anything else | Navigates to the search. |

## One application (`easy-apply.js`)

```
open job ─► already applied? ─► yes ─► SKIPPED
   │
   ▼
click Easy Apply ─► modal opened? ─► no ─► daily limit? ─► end run
   │                                            └──► FAILED
   ▼
┌─► current step
│     ├─ resume (resume.js): select; if unknown, ask and save
│     ├─ fields (fields.js): extract → resolve (profile → answers) → fill
│     │      └─ unknown required → ask as a batch → save → fill
│     ├─ review: set "follow company"
│     └─ primary button
│           ├─ Next/Review → wait for the step to change
│           │      └─ validation errors → ask again with the error (max 2)
│           └─ Submit → (optional confirmation) → success? APPLIED
└──────────┘
Any SkipJob → discard the form → SKIPPED/FAILED
StopSignal  → discard the form → run stopped
```

## Recognising questions

`text.js` builds the key `family:normalised-label`:

- `choice`: select and radio (they share answers).
- `text`: text, number, date, textarea, typeahead.
- `multi`: checkbox group.
- `checkbox`: single checkbox (yes/no).

Resolution order for a field:

1. **Profile** (`profile.js`): email, phone, country code, name, city, LinkedIn, website.
2. **Answer bank**: exact key match.
3. **User**: asked in the panel, with the closest saved answer suggested (Jaccard similarity ≥ 0.6), never applied without confirmation.

Fields LinkedIn already prefilled are kept. Unknown optional fields are asked too by default (configurable).

## Maintaining selectors

LinkedIn changes its HTML often. All site-specific knowledge lives in [`extension/content/selectors.js`](../extension/content/selectors.js):

- `LAA.SEL`: ordered selector lists (`data-*` attributes first, then classes, then `aria-label`).
- `LAA.UI_TEXT`: button and message text in EN, PT-BR, ES, FR and DE, compared accent-free on whole words.
- `LAA.BLOCKERS`: captcha, sign-in and daily-limit patterns.

To support a new layout: open a job, start Easy Apply by hand, inspect the modal in DevTools and add the new selector at the top of the matching list. Then run `npm run test:e2e`.

## Design decisions

- **No build, no runtime dependencies:** files are classic scripts that register on `globalThis.LAA`. The same file runs in the content script, the service worker (`importScripts`), the panel and Node (tests).
- **Navigation by job URL** (`/jobs/view/<id>/`) instead of clicking the list: more robust to search layout changes and naturally resumable.
- **Random pauses** between actions (0.4 to 1.5 s) and between applications (configurable); character-by-character typing in autocomplete fields.
- **Safe rendering in the panel:** only `textContent` for data coming from LinkedIn.
