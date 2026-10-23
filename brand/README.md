# Goldcom Brand Kit v1.0

Everything an AI agent, designer or developer needs to produce on-brand Goldcom work.

## How to feed your AI agent

| Agent setup | Give it |
|---|---|
| **System prompt / custom instructions only** | Paste the block from [`AGENT_SYSTEM_PROMPT.md`](AGENT_SYSTEM_PROMPT.md) |
| **Agent with file or knowledge access** | [`GOLDCOM_BRAND_GUIDELINES.md`](GOLDCOM_BRAND_GUIDELINES.md) + [`tokens/tokens.json`](tokens/tokens.json) + the [`logo/`](logo) folder |
| **Agent that reads PDFs or images** | Add [`Goldcom_Brand_Book.pdf`](Goldcom_Brand_Book.pdf) for the visual reference |
| **Code-generating agent** | Add [`tokens/tokens.css`](tokens/tokens.css) or [`tokens/tailwind.preset.cjs`](tokens/tailwind.preset.cjs) and tell it to use only these variables |

Order of authority: Hard Rules (§0) → Claims register (§11) → `tokens.json` → the rest of the guidelines → the request.

## Contents

```
brand/
├── GOLDCOM_BRAND_GUIDELINES.md   Full brand manual (agent-readable, with YAML quick reference)
├── AGENT_SYSTEM_PROMPT.md        Compact system prompt to paste into any AI agent
├── brand-book.html               Visual brand book (open in a browser)
├── Goldcom_Brand_Book.pdf        PDF export of the brand book
├── logo/
│   ├── goldcom-logo-horizontal.svg              Primary (light backgrounds)
│   ├── goldcom-logo-horizontal-reversed.svg     Dark backgrounds
│   ├── goldcom-logo-horizontal-mono-black.svg   One colour / light gold backgrounds
│   ├── goldcom-logo-horizontal-mono-white.svg   One colour / dark gold, photos
│   ├── goldcom-logo-stacked*.svg                Stacked versions (+ reversed, mono)
│   ├── goldcom-symbol*.svg                      Symbol only (+ mono)
│   ├── goldcom-app-icon.svg                     App icon master (1024 × 1024)
│   └── goldcom-logo-original.png                Original raster reference
├── tokens/
│   ├── tokens.json               Design tokens (source of truth)
│   ├── tokens.css                CSS custom properties + light/dark roles
│   └── tailwind.preset.cjs       Tailwind preset
├── patterns/                     Facet pattern tiles (dark, gold, light)
└── reference/                    Official app-store creative used as reference
```

## Notes

- The SVG logos are vector traces of the official logo asset. The symbol is redrawn exactly on its 45° grid, and the wordmark is traced from the master PNG. Replace them with the designer's original vector masters when available. The colours and geometry already match.
- Arabic copy in these files should be reviewed by a native Omani copywriter before it is used in public campaigns.
- Claims marked 🟡 in the Claims Register need management sign-off and supporting documents before use.
- To change the brand, update `tokens/tokens.json` and `GOLDCOM_BRAND_GUIDELINES.md` together and bump the version.

## Make designs with these rules

[`../studio`](../studio) is a web workspace that uses this kit to create carousels, posts, animations and videos, by hand or from Claude Code (`npm run connect`).
