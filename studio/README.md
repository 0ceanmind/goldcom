# Goldcom Studio

An **AI production studio** for Goldcom's Instagram. You describe what you want in plain words, in Arabic or English, and Claude produces it end to end: a finished Reel (MP4 with sound), a carousel, a Story or a post. It uses **real footage of the Goldcom app**, motion-designed scenes, illustrated Omani characters and the Goldcom brand system, and an AI art director reviews every piece before you see it. Everything it makes stays fully editable in the studio's editor.

> "Make a step-by-step guide on how to buy gold in the app" → a 25-second Reel: a hook, one scene per step with the real app recording playing inside a phone, the camera pushing in on every tap, a close-up on the locked price, a recap and the outro, rendered to MP4 with sound effects.
>
> "Make a carousel for two people, one living with Goldcom and one without" → a story carousel: meet the two neighbours, then side-by-side moments (buying, keeping it safe, gifting) in contrasting settings, then the outro.

## How a production works

When you press **Create**, the request goes through the same steps a creative agency would take. You can watch each one live on the production page:

1. **Brief:** format, language, audience, key message, the app flows that must be shown, and the assumptions Claude made.
2. **Ideas:** three different creative directions (for example a calm practical demo, a human story, a surprising contrast), each with its exact opening line and scene beats.
3. **Direction:** a creative director scores the three on hook, clarity, brand fit, feasibility and originality, picks one and improves it. Tick **Let me pick the concept** to choose yourself.
4. **Storyboard:** every scene with its final on-screen words, timing, theme, transition and the footage it needs.
5. **Footage:** each app step is matched to a real recording from the **Footage** library (start and end trimmed to the exact tap). Missing flows are filmed on a connected Android phone (see below), or flagged with a precise "record this" note.
6. **Build:** motion-designed scenes (below) assemble the piece. Spotlight close-ups find the exact on-screen element with vision instead of guessing.
7. **Review:** an art director looks at rendered frames and checks legibility, overlaps, safe zones, footage relevance, pacing, copy and claims, then applies precise fixes (up to two rounds).
8. **Video:** Reels and Stories are rendered to MP4 automatically. Carousels download as full-size PNGs.

Afterwards you can type changes ("make the hook punchier", "15 seconds", "use a woman in step 2") and Claude revises the same production, or pick one of the other concepts. A production typically takes 5–10 minutes and about 7–10 Claude calls.

### Connecting Claude

Open **Settings** (gear icon) and choose one:

- **My Claude Code login:** if Claude Code is installed and signed in on this computer, the studio uses it (your Claude plan). Nothing else to set up.
- **Anthropic API key:** paste a key from the Anthropic Console (billed to that account).

The default model is Claude Opus 5.5 at "Thorough". **Test connection** checks it.

### Real app footage

The **Footage** page holds real recordings and screenshots of the Goldcom app. Claude watches each one (screens, button labels, whether personal data is visible) and cuts them into productions.

- **Any phone:** record the screen (iPhone: Control Centre → Screen Recording; Android: Quick settings → Screen record), go through the flow slowly, and drop the video on the Footage page. Long recordings are split into steps automatically.
- **Android phone over USB (recommended):** press **Install Android tools** once, connect the phone with USB debugging on, and Claude can operate the real app itself. Type a goal ("open Browse, open the 1 g bar, tap Buy gold, stop on the review screen before paying"): Claude **rehearses** the flow screen by screen, then records **one clean take** at a natural pace with a clean status bar (09:41, full battery, no notifications) and every tap logged, so the editor can add tap ripples and camera zooms in the right places. It never confirms payments, sales or gifts and never types personal data. You can also mirror the phone, take screenshots, or record yourself while it logs your taps.

### Production scenes

Claude composes with motion-designed scenes, each built for 9:16 first and adapted to 4:5, 1:1 and 16:9, in Arabic (RTL) and English:

| Scene | What it is |
|---|---|
| `hook` | Kinetic opener: the line lands word by word, gold rule, phone rising with real footage, gold bar or a character |
| `app-step` | Step badge + instruction, real footage in a phone, camera eases to each tap, tap ripples; a "tap here" hint on stills |
| `app-hero` | 3D-tilted phone (or two) slowly turning, like the App Store creatives |
| `ui-zoom` | Spotlight on one part of a real screen with a callout, camera pushes in |
| `split` | Without / with comparison: two people in contrasting settings |
| `cast` | Meet the people: one or two illustrated characters with name tags |
| `moment` | A story beat: a person in a setting, narration and a speech bubble |
| `checklist` | Items tick in with gem checks |
| `title-card`, `outro` | Chapter card; logo reveal + call to action + disclaimer |

The classic templates (price board, notifications, stickers, chat, countdown, facts, myths…) remain available too.

**Illustrations:** 15 poses (phone, stressed, celebrate, give a gift, hold a gold bar…), 7 moods, men in dishdasha with kumma or massar, women in abaya with hijab or sheila, 28 props and 6 settings (room, souq, office, evening room, studio, Muscat outdoors), each in light and dark versions.

**Motion engine:** keyframes on any layer, camera moves, premium phone mockups with true 3D perspective, video footage inside phones with speed ramps and holds, push / whip-pan / zoom-through / blur / gold-edged facet transitions.

**Sound:** every export gets synthesized sound design (soft whooshes on transitions, taps, notification and success chimes, logo sting) and optionally one of three music beds (calm, modern, warm Eid), mixed to −14 LUFS for Instagram. You can also leave the music off and add Instagram audio when posting.

## Install once, update with one click

See [`../install/README.md`](../install/README.md) for the full, plain-language version.

- **Windows:** in PowerShell, run `irm https://raw.githubusercontent.com/0ceanmind/goldcom/claude/friendly-ritchie-ou0783/install/install-windows.ps1 | iex`. Or, in a downloaded copy, double-click **Install Goldcom Studio.cmd**.
- **Mac / Linux:** `curl -fsSL https://raw.githubusercontent.com/0ceanmind/goldcom/claude/friendly-ritchie-ou0783/install/install-mac-linux.sh | bash`

This installs Node.js if needed, puts Goldcom in your home folder and adds a **Goldcom Studio** shortcut. Double-click it to start; the first start downloads components (including the video renderer) and takes a few minutes.

**Updates:** when a new version is pushed to GitHub, the studio shows **Update available**. Click **Update now**: it downloads the changes, installs what changed, rebuilds and restarts itself, and the page reloads. Your designs, footage and settings (in `studio/data`) are never touched. If an update fails, it rolls back to the version you had. The update channel (branch) can be changed in Settings.

## Quick start (developers)

```bash
cd studio
npm install
npx playwright install chromium   # headless renderer for MP4 export and AI previews
npm run studio                    # builds the editor and serves it at http://localhost:5177
```

Requires Node 20+.

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
| `produce` / `production_status` / `revise_production` | Hand a request to the studio's AI production pipeline, follow it, ask for changes |
| `list_footage` / `import_footage` | Real app recordings and screenshots: list them (steps, screens, taps) or add one from a path |
| `export_video` / `job_status` | Studio-quality MP4 (frame-exact, with sound) rendered on the server |

Prompts `project_carousel` and `project_video` are also exposed as slash commands. If the studio isn't running, the MCP server builds and starts it automatically when it needs to render.

### The auditor

[`../.claude/agents/goldcom-auditor.md`](../.claude/agents/goldcom-auditor.md) is an independent reviewer. It checks visual consistency with the brand, claims and disclaimers, Instagram readiness, and whether the copy sounds human or robotic and generic ("AI slop"), in English and Arabic. The skill makes Claude run it after every design and fix what it finds. The library in this repo went through four audit passes.

## Using the studio

- **Create** (home): the prompt, example requests, readiness (Claude, phone, footage) and your productions.
- **Designs:** *Your designs* and the *Library*. Filter by Posts, Carousels, Reels, Stories, Animated posts and Videos, search, switch the library between Arabic and English. Hover to play. The eye button opens the Instagram preview, the ⋯ menu duplicates, renames, exports or deletes. Press **Use** on a library card to get your own editable copy.
- **New design:** start from a starter pack in Arabic or English and pick the type: post, carousel, Reel, Story, animated post or video. Reels and Stories are always 9:16.
- **Slides:** add from 27 templates. Duplicate, reorder, delete.
- **Slide panel:** template content, theme (Onyx, Charcoal, Bullion, Cream, Sand), pattern, background, duration, transition and background motion. Wrap a word in `*asterisks*` for the gold accent.
- **Layer panel:** position, size, opacity, entrance animation, exit, and a loop (float, pulse, breathe, shimmer, spin, scroll…) that keeps a layer moving so the post feels alive.
- **Caption tab:** the Instagram caption and hashtags, with character and hashtag counters.
- **Canvas:** click to select, drag to move (snaps to centre and margins), corner handles to resize, double-click text to edit, arrow keys to nudge, Delete to remove, Ctrl/Cmd+C / V to copy and paste layers, Ctrl/Cmd+D to duplicate, Ctrl/Cmd+Z to undo. The **zones** button shows where Instagram's interface covers a Reel or Story, and the 3:4 crop of the profile grid.
- **Story stickers:** polls, quizzes, sliders, question boxes and countdowns can be marked as *Instagram's own sticker*. The studio then reserves the space with a dashed marker that is not exported, so you add the real, tappable sticker when you post.
- **Images:** drop or paste images onto the canvas, or use **Choose → Live screenshot from a URL** to capture your running app.
- **Brand check:** red-tier claims, amber claims needing sign-off, misspelt names, missing disclaimers, "Live" labels on prices, repeated or rotated logos, OMR format, text under the Instagram interface, drawn stickers in Stories, and caption length, hashtags and emoji.
- **Export:** depends on the type. Reels and videos → one MP4. Stories → one MP4 per frame (ZIP). Carousels → PNG ZIP, or an MP4 per slide. Posts and animated posts → PNG or MP4. Every type → GIF, caption (TXT) and the design file (JSON). ZIPs include `caption.txt`. Videos and image sets are rendered by the studio itself, frame by frame (exact footage frames, 30 or 60 fps, H.264, with sound), and land in `data/exports/`.
- **People:** the People menu adds a person, a setting, a prop or a speech bubble. Select a person to change pose, mood, what they hold, outfit and facing direction.
- Changes save automatically. If the server can't be reached, the editor keeps retrying and warns you before you close the tab.

Hand-edited template slides are marked "edited". Content changes then update text in place instead of resetting your layout. Use **Re-apply template layout** to rebuild.

## Development

```bash
npm run dev     # API on :5177 + Vite with hot reload on :5173
npm test        # end-to-end test that drives the MCP server like Claude Code does
npm run test:ui # 29 editor scenarios in a headless browser, best and worst cases (needs the studio running)
node scripts/character-sheet.mjs   # contact sheets of every pose, mood, prop and setting
node scripts/audio-demo.mjs        # renders the sound library and a demo soundtrack
```

```
studio/
├── shared/        brand tokens, schema, templates, production scenes (scenes.js), layout helpers, library, brand lint
├── src/           React app (Create, Production, Footage, editor) · render/: canvas renderer, motion (keyframes, camera),
│                  device (3D phones), media (footage frames), extras + characters/ (illustrations)
├── server/        HTTP API + SSE · ai/ (Claude engine, pipeline, knowledge, footage indexing) · capture/ (Android driver,
│                  Claude-operated capture) · footage/ (library, scene detection, tap alignment) · render/ (MP4 export,
│                  review frames, soundtrack) · audio/ (synthesized SFX, music beds, mixer) · updater.mjs · routes/
├── mcp/           MCP server for Claude Code
├── skill/         /goldcom-studio Claude Code skill
├── samples/       documents seeded on first run
└── data/          your designs and assets (git-ignored; set GOLDCOM_STUDIO_DATA to move it)
```

Designs are plain JSON files in `data/documents/`. Every slide stores its template and content plus the generated layers, so the same file works for people, the editor and Claude.

Environment variables: `PORT` (default 5177), `HOST` (default 127.0.0.1), `GOLDCOM_STUDIO_DATA`, `GOLDCOM_STUDIO_URL` (for the MCP server), `PLAYWRIGHT_CHROMIUM_PATH`.

## Notes

- The studio binds to `127.0.0.1` and is meant for local use. URL capture fetches any address you give it, so don't expose the server publicly.
- Studio exports render in a headless Chromium (Playwright) and encode with a bundled ffmpeg. Without the headless browser the editor falls back to exporting in your browser (WebCodecs).
- Claude usage: a full production is roughly 7–10 Claude calls (about $1–3 with an API key at Opus pricing; with a Claude Code login it counts toward your plan's usage).
- Footage recorded from a real account can show personal data and real prices. Claude flags both; check the **Before posting** notes.
- Arabic copy in the library and samples should be reviewed by a native Omani copywriter before public campaigns.
- Prices in the library are illustrative and labelled "Indicative" with a date. Library designs that show prices, countdowns or native stickers carry a **Before posting** note telling you what to update.
