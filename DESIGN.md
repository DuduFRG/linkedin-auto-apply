# Design system: "Relatório Anual"

ApplyPilot presents itself as the annual report of a job search. Every claim is shown as a numbered figure, table or diagram with a source note, never as a loose number or a marketing card. The same world runs on the landing page (`site/`, Persuade) and in the extension side panel (`extension/sidepanel/`, Operate, quieter).

## Color

| Token | Hex | Role |
| --- | --- | --- |
| Petrol | `#0F2A4A` | Cover field, masthead, back cover, footer. The only large color field. |
| Ink | `#0B1726` | Body text and strong rules (2px section rules). |
| Ink 2 / Slate | `#33445A` / `#56677D` | Secondary text, notes, axis labels. |
| Paper | `#F4F6F9` | Page ground (cool, never cream). |
| Sheet | `#FFFFFF` | Alternating report sections, panel cards. |
| Rule | `#C9D2DE` / `#DDE3EA` | Hairlines between rows and sections. |
| Green | `#1E7A5C` (on dark `#52C79C`) | Primary action, "answered / learned / sent", the current bar. |
| Amber | `#9A5512` (on dark `#F0B45F`) | "Needs you": new questions, pending state. |

Rules: green and amber always carry a text label too (states are never color only). The newest data point is always the strongest mark.

## Type

- **Schibsted Grotesk** 500 to 700: headings, figure labels, figures, tab labels. Display at 650, tracking -0.03 to -0.04em.
- **Public Sans** 400 to 600: running text, tables, controls.
- System monospace only for real code (`chrome.storage.local`, `connect-src 'none'`, `chrome://extensions`).
- Both faces are self-hosted, subset Latin WOFF2 (`site/assets/fonts`, `extension/fonts`), `font-display: swap`.

## Layout

- 12-column grid, visible as hairlines on the cover. Blocks snap to whole columns.
- Report sections: heading and intro in columns 1 to 4, content in columns 6 to 12; stacked below 1040px.
- Figures carry a label row: bold kind and number ("Gráfico 1", "Tabela 1", "Diagrama 1", "Figura 1") plus a title, over a 1px rule, and a source note below.
- Corners nearly square (4px). Shadows only on the product screenshot.

## Components

- Buttons: green solid (primary), 1px outline (secondary), 48px tall on the site, 36px in the panel.
- Data tables collapse to labeled rows on phones.
- Flow diagram: 2px ink line with square nodes and 90-degree branch connectors; the send step is the green gate.
- Panel: petrol masthead, status as a statement (dot + label, ledger row of three figures, 4px progress), underline tabs, amber-framed question card, ledger lists for answers and history, first-run terms card.

## Motion

One authored moment: the cover chart bars grow left to right (110ms stagger, expo ease-out), then values and callouts fade in. Panel: tab underline slide, pending card enter, progress scale. Everything is disabled under `prefers-reduced-motion`.

## Voice

Portuguese first, sentence case, plain verbs, no hype, no em dash, no emojis. Disclose platform risks plainly ("Fatores de risco").
