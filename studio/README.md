# Goldcom Studio

A local web workspace for making **on-brand Goldcom carousels, posts, animations, videos and app-store screenshots**, connected to **Claude Code** so any project you build can turn into a full carousel or video in the Goldcom identity.

- **Editor:** a canvas editor with 13 brand templates, 15 layer types (text, lists, logo, phone/browser mockups with live screenshots, code cards, gold bars, price charts, buttons, badges, icons…), Arabic RTL and English, themes, entrance animations, video transitions, undo/redo, snapping and brand checks.
- **Exports:** PNG, the whole carousel as a ZIP, **MP4 video** (frame-exact, encoded in the browser), animated single slides, and GIF.
- **Claude Code:** an MCP server plus a `/goldcom-studio` skill. Claude reads your project, screenshots it running, writes the copy, builds the slides and checks them against the brand. The design appears live in the editor.

Everything is drawn from the brand system in [`../brand`](../brand): the colour tokens, Inter and IBM Plex Sans Arabic, the vector logo, the 45° facet pattern, the voice and the claims register.

---

## Quick start

```bash
cd studio
npm install
npm run studio        # builds the editor and serves it at http://localhost:5177
```

Requires Node 20+. For **live URL screenshots** and **Claude previews**, install a headless browser once:

```bash
npx playwright install chromium
```

## Connect Claude Code (one time)

```bash
cd studio
npm run connect
```

This registers the `goldcom-studio` MCP server for **all** your projects (user scope) and installs the `/goldcom-studio` skill into `~/.claude/skills`. Restart Claude Code, open any project, and ask:

```
/goldcom-studio make an Arabic carousel about this project
/goldcom-studio 20-second 9:16 launch video in English
/goldcom-studio screenshot my app at localhost:3000 and put it on slide 3
```

Manual alternative:

```bash
claude mcp add goldcom-studio --scope user -- node /absolute/path/to/goldcom/studio/mcp/server.mjs
```

The repository root also ships a `.mcp.json`, so Claude Code sessions opened **in this repo** pick up the server automatically.

### What Claude can do (MCP tools)

| Tool | Purpose |
|---|---|
| `studio_guide` | Brand rules, workflow, every template and its fields (called first) |
| `create_design` | New carousel, post or video from template slides. Opens it in the studio |
| `edit_slide` / `add_slides` / `remove_slides` / `update_design` | Change copy, templates, themes, order, format, language |
| `capture_screenshot` | Live screenshot of a running app (phone, tablet or desktop), optionally placed into a slide |
| `add_asset` | Import an image from the project or a URL |
| `render_preview` | Renders slides to PNG so Claude can see and refine them |
| `brand_check` | Claims, name spelling, disclaimers, logo use, OMR format |
| `export_pngs` | Saves full-size PNGs into a folder in the project |
| `list_designs` / `get_design` / `delete_design` / `open_studio` | Library management |

Prompts `project_carousel` and `project_video` are also exposed as slash commands. If the studio isn't running, the MCP server builds and starts it automatically when it needs to render.

## Using the editor

- **Library → New design:** start from a starter pack (launch carousel, project showcase, price post, gifting reel, App Store set, blank) in Arabic or English, in any format: 4:5, 1:1, 9:16, LinkedIn, 16:9, App Store.
- **Slides:** add from 13 templates (cover, statement, feature, screenshot, steps, checklist, big number, quote, before/after, code, price card, full image, call to action). Duplicate, reorder, delete.
- **Slide panel:** edit the template content (headline, items, screenshot…), theme (Onyx, Charcoal, Bullion, Cream, Sand), pattern, background, duration and transition. Wrap a word in `*asterisks*` for the gold accent.
- **Canvas:** click to select, drag to move (snaps to centre and margins), corner handles to resize, double-click text to edit, arrow keys to nudge, Delete to remove, Ctrl/Cmd+D to duplicate, Ctrl/Cmd+Z to undo.
- **Images:** drop or paste images onto the canvas, or use **Choose → Live screenshot from a URL** to capture your running app at phone or desktop size.
- **Motion:** set an entrance animation per layer (fade, fade up, slide, scale, draw, count up, typewriter, gleam). Press **Play** to preview. Switch the document to **Video** to play all slides with transitions.
- **Brand check:** flags red-tier claims ("guaranteed", "risk-free"…), amber claims needing sign-off, misspelt names, missing disclaimers, repeated or rotated logos, and OMR prices without 3 decimals.
- **Export:** PNG, ZIP of all slides, MP4 (all slides, or one animated slide), GIF, or the document JSON.

Hand-edited template slides are marked "edited". Content changes then update text in place instead of resetting your layout. Use **Re-apply template layout** to rebuild.

## Development

```bash
npm run dev     # API on :5177 + Vite with hot reload on :5173
npm test        # end-to-end test that drives the MCP server like Claude Code does
```

```
studio/
├── shared/        brand tokens, logo paths, icons, document schema, templates, starters, brand lint (used by editor + server + MCP)
├── src/           React editor · render/renderer.js (canvas renderer) · render/export.js (PNG/ZIP/MP4/GIF)
├── server/        HTTP API, live updates (SSE), assets, Playwright capture/render
├── mcp/           MCP server for Claude Code
├── skill/         /goldcom-studio Claude Code skill
├── samples/       documents seeded on first run
└── data/          your designs and assets (git-ignored; set GOLDCOM_STUDIO_DATA to move it)
```

Designs are plain JSON files in `data/documents/`. Every slide stores its template and content plus the generated layers, so the same file works for people, the editor and Claude.

Environment variables: `PORT` (default 5177), `HOST` (default 127.0.0.1), `GOLDCOM_STUDIO_DATA`, `GOLDCOM_STUDIO_URL` (for the MCP server), `PLAYWRIGHT_CHROMIUM_PATH`.

## Notes

- The studio binds to `127.0.0.1` and is meant for local use. URL capture fetches any address you give it, so don't expose the server publicly.
- MP4 uses the browser's WebCodecs encoder (H.264 where available, otherwise VP9/WebM). Chrome and Edge give the best results.
- Arabic sample copy should be reviewed by a native Omani copywriter before public campaigns.
