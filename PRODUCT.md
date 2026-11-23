# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Any professional looking for a job or a career change, in any field, who applies through LinkedIn Easy Apply. They apply to many jobs in a short period, usually at a laptop or desktop, often after work or between other tasks, and are tired of typing the same answers (phone, city, years of experience, English level, salary expectation) into every form. Secondary audience: developers who discover the project on GitHub and may star, audit or contribute.

## Product Purpose

ApplyPilot is a free, open-source Chrome extension (Manifest V3) that applies to LinkedIn Easy Apply jobs for the user. It fills each form with what it already knows (local profile and previously given answers), selects the resume the user chose, and pauses only when it meets a question it has never seen. The user answers once in a side panel; the answer is stored locally and reused. Success: the user sends more good applications with far less repetitive typing, and the extension asks fewer questions on every run.

## Positioning

It learns from the user instead of guessing: every new question is asked once, then remembered, so each application asks less than the previous one. All data stays in the browser (chrome.storage.local, extension pages locked to connect-src 'none'); there is no server, account or tracking.

## Operating Context

- The extension drives one LinkedIn tab while the user keeps browsing elsewhere; the side panel shows status, statistics, pending questions, the answer bank, profile and history.
- The landing page (static HTML on GitHub Pages, pt-BR) exists to get the extension downloaded and the repository starred, and to be shared in a LinkedIn post.
- Installation is manual: download ZIP, unzip, chrome://extensions, Developer mode, Load unpacked, select the `extension` folder. About 2 minutes.

## Capabilities and Constraints

- Easy Apply jobs only; external applications are skipped.
- Human-paced random pauses; pauses on captcha, sign-in or verification; stops at LinkedIn's daily limit; never solves captchas or spoofs the browser.
- Options: confirm before sending, skip by keyword, remote only, ask optional fields, follow companies, goal per run, min/max pause.
- Interface in Portuguese, English and Spanish.
- Desktop Chromium browsers only (Chrome 116+, Edge, Brave); mobile browsers cannot run it. The landing page itself must work on every device.
- LinkedIn's User Agreement restricts automated tools; accounts may be restricted. This must be disclosed plainly.

## Brand Commitments

- Name: ApplyPilot. Repository: github.com/DuduFRG/linkedin-auto-apply. License MIT.
- Creator: Eduardo de Fraga, Instagram @dudu_frg (authorised by the user to appear on the site).
- Independent project, not affiliated with LinkedIn; no LinkedIn logo or brand imitation.
- Voice: sophisticated, warm, confident, no exaggeration. Never use the em dash. No emojis; SVG icons only.
- Legal pages required: privacy policy, terms of use, and the disclosures a browser extension and open-source project need.

## Evidence on Hand

- Real product UI: the side panel (extension/sidepanel), screenshots via scripts/capture-screenshots.js with fictional demo data.
- Facts: free, MIT, 3 languages, ~2 minute install, local-only storage, open source.
- Absent and not to be fabricated: user counts, testimonials, star counts, press, measured time savings, success rates.

## Product Principles

1. Ask once, remember forever: the product is judged by how rarely it needs the user.
2. Privacy is architecture, not a promise: nothing leaves the browser.
3. Careful over fast: human pace, stop at every verification, honest about platform rules.
4. The user stays in control: pause, confirm, filter and review at any time.

## Accessibility & Inclusion

Basic WCAG AA: contrast, visible keyboard focus, reduced motion respected, semantic structure, alt text, touch targets of 44px on the landing page.
