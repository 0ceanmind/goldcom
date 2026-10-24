# Goldcom Studio

A local web workspace for making **on-brand Goldcom content for Instagram**: feed posts, carousels, Reels, Stories and animated posts, plus LinkedIn, video and App Store sizes. It is connected to **Claude Code**, so any project you build can become a carousel or Reel in the Goldcom identity, and every design is reviewed by a brand **auditor agent** before it is handed over.

- **Gallery:** your designs and a library of 49 ready-made designs (13 posts, 9 carousels, 9 Reels, 8 Stories, 9 animated posts, 1 video), each in Arabic and English. Cards play when you hover them. Carousels flip as you move across them.
- **Instagram preview:** see any design inside a phone, as a feed post, Reel, Story or on the profile grid, with the caption and Instagram's interface safe zones.
- **Editor:** 27 templates and 23 layer types, including the "live" ones: an animated price board, push notifications, Story stickers, countdowns, chats that type themselves, progress rings, kinetic type and a logo reveal. Entrance animations, exits, continuous loops, background drift and transitions. Arabic RTL and English, themes, undo/redo, snapping and brand checks.
- **Exports:** PNG, ZIP, **MP4** (a whole Reel, each Story frame, or an animated post), GIF, the caption as text and the design file.
- **Claude Code:** an MCP server, a `/goldcom-studio` skill and the `goldcom-auditor` agent. Claude reads your project, screenshots it running, writes the copy and caption, builds the slides, checks them against the brand and has them audited.

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

This registers the `goldcom-studio` MCP server for **all** your projects (user scope), installs the `/goldcom-studio` skill into `~/.claude/skills` and the `goldcom-auditor` agent into `~/.claude/agents`. Restart Claude Code, open any project, and ask:

```
/goldcom-studio make an Arabic Instagram carousel about this project
/goldcom-studio 20-second Instagram Reel in English
/goldcom-studio a Story with a poll about gifting gold
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
| `create_design` | New post, carousel, Reel, Story, animated post or video from template slides, with caption and notes. Opens it in the studio |
| `list_library` / `create_from_library` | Browse the ready-made library and copy a design to adapt |
| `set_caption` | Instagram caption and hashtags |
| `edit_slide` / `add_slides` / `remove_slides` / `update_design` | Change copy, templates, themes, order, format, language |
| `capture_screenshot` | Live screenshot of a running app (phone, tablet or desktop), optionally placed into a slide |
| `add_asset` | Import an image from the project or a URL |
| `render_preview` | Renders slides to PNG so Claude can see and refine them |
| `brand_check` | Claims, name spelling, disclaimers, logo use, OMR format, Instagram safe zones, caption limits |
| `export_pngs` | Saves full-size PNGs into a folder in the project |
| `list_designs` / `get_design` / `delete_design` / `open_studio` | Library management |

Prompts `project_carousel` and `project_video` are also exposed as slash commands. If the studio isn't running, the MCP server builds and starts it automatically when it needs to render.

### The auditor

[`../.claude/agents/goldcom-auditor.md`](../.claude/agents/goldcom-auditor.md) is an independent reviewer. It checks visual consistency with the brand, claims and disclaimers, Instagram readiness, and whether the copy sounds human or robotic and generic ("AI slop"), in English and Arabic. The skill makes Claude run it after every design and fix what it finds. The library in this repo went through four audit passes.

## Using the studio

- **Gallery** (home): *Your designs* and the *Library*. Filter by Posts, Carousels, Reels, Stories, Animated posts and Videos, search, switch the library between Arabic and English. Hover to play. The eye button opens the Instagram preview, the ⋯ menu duplicates, renames, exports or deletes. Press **Use** on a library card to get your own editable copy.
- **New design:** start from a starter pack in Arabic or English and pick the type: post, carousel, Reel, Story, animated post or video. Reels and Stories are always 9:16.
- **Slides:** add from 27 templates. Duplicate, reorder, delete.
- **Slide panel:** template content, theme (Onyx, Charcoal, Bullion, Cream, Sand), pattern, background, duration, transition and background motion. Wrap a word in `*asterisks*` for the gold accent.
- **Layer panel:** position, size, opacity, entrance animation, exit, and a loop (float, pulse, breathe, shimmer, spin, scroll…) that keeps a layer moving so the post feels alive.
- **Caption tab:** the Instagram caption and hashtags, with character and hashtag counters.
- **Canvas:** click to select, drag to move (snaps to centre and margins), corner handles to resize, double-click text to edit, arrow keys to nudge, Delete to remove, Ctrl/Cmd+C / V to copy and paste layers, Ctrl/Cmd+D to duplicate, Ctrl/Cmd+Z to undo. The **zones** button shows where Instagram's interface covers a Reel or Story, and the 3:4 crop of the profile grid.
- **Story stickers:** polls, quizzes, sliders, question boxes and countdowns can be marked as *Instagram's own sticker*. The studio then reserves the space with a dashed marker that is not exported, so you add the real, tappable sticker when you post.
- **Images:** drop or paste images onto the canvas, or use **Choose → Live screenshot from a URL** to capture your running app.
- **Brand check:** red-tier claims, amber claims needing sign-off, misspelt names, missing disclaimers, "Live" labels on prices, repeated or rotated logos, OMR format, text under the Instagram interface, drawn stickers in Stories, and caption length, hashtags and emoji.
- **Export:** depends on the type. Reels and videos → one MP4. Stories → one MP4 per frame (ZIP). Carousels → PNG ZIP, or an MP4 per slide. Posts and animated posts → PNG or MP4. Every type → GIF, caption (TXT) and the design file (JSON). ZIPs include `caption.txt`.
- Changes save automatically. If the server can't be reached, the editor keeps retrying and warns you before you close the tab.

Hand-edited template slides are marked "edited". Content changes then update text in place instead of resetting your layout. Use **Re-apply template layout** to rebuild.

## Development

```bash
npm run dev     # API on :5177 + Vite with hot reload on :5173
npm test        # end-to-end test that drives the MCP server like Claude Code does
npm run test:ui # 26 editor scenarios in a headless browser, best and worst cases (needs the studio running)
```

```
studio/
├── shared/        brand tokens, logo paths, icons, document schema, templates, library, starters, brand lint (used by editor + server + MCP)
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
- Arabic copy in the library and samples should be reviewed by a native Omani copywriter before public campaigns.
- Prices in the library are illustrative and labelled "Indicative" with a date. Library designs that show prices, countdowns or native stickers carry a **Before posting** note telling you what to update.
