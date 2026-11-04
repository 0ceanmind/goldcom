# Goldcom Studio

An **AI production studio** for Goldcom's Instagram. You describe what you want in plain words, in Arabic or English, and Claude produces it end to end: a finished Reel (MP4 with sound), a carousel, a Story or a post. Claude directs the production; ChatGPT develops concepts and writes Omani Arabic and English. It uses illustration, photography, visual diagrams, editorial layouts, verified app footage and optional 3D, with a rendered-frame review before approval. Everything it makes stays fully editable in the studio's editor.

> "Make a step-by-step guide on how to buy gold in the app" → a 25-second Reel: a hook, one scene per step with the real app recording playing inside a phone, the camera pushing in on every tap, a close-up on the locked price, a recap and the outro, rendered to MP4 with sound effects.
>
> "Make a carousel for two people, one living with Goldcom and one without" → a story carousel: meet the two neighbours, then side-by-side moments (buying, keeping it safe, gifting) in contrasting settings, then the outro.

## How a production works

When you press **Create**, the request goes through the same steps a creative agency would take. You can watch each one live on the production page:

1. **Brief:** format, language, audience, key message, the app flows that must be shown, and the assumptions Claude made.
2. **Ideas:** ChatGPT develops three different creative directions against the saved creative history (for example a calm practical demo, a human story, a surprising contrast), each with its exact opening line and scene beats.
3. **Direction:** a creative director scores the three on hook, clarity, brand fit, feasibility and originality, picks one and improves it. Tick **Let me pick the concept** to choose yourself.
4. **Storyboard:** Claude plans each scene, visual construction, timing, theme, transition and required footage. ChatGPT then writes and polishes both the Omani Arabic and English versions. Both versions are retained on the production; the selected language is built.
5. **Footage:** each app step is matched to a real recording from the **Footage** library (start and end trimmed to the exact tap). Missing flows are filmed on a connected Android phone (see below), or flagged with a precise "record this" note.
6. **Build:** motion-designed scenes (below) assemble the piece. Spotlight close-ups find the exact on-screen element with vision instead of guessing.
7. **Review:** Claude looks at rendered frames and checks legibility, overlaps, safe zones, footage relevance, pacing, copy and claims, then applies precise fixes (up to two rounds). Copy changes return to ChatGPT before rebuilding and reviewing. Text-only slides cannot pass the export gate, even with an approving model verdict.
8. **Video:** Reels and Stories are rendered to MP4 automatically. Carousels download as full-size PNGs.

Afterwards you can type changes ("make the hook punchier", "15 seconds", "use a woman in step 2") and Claude revises the same production, or pick one of the other concepts. Productions use a variable number of calls for concepts, footage, edits and a final review. The historical audit measured several minutes before export; rendering time depends on the scenes and machine. The Settings budget limits usage estimates; no fixed cost or turnaround is promised.

### Connecting Claude

Open **Settings** (gear icon) and choose one:

- **My Claude Code login:** if Claude Code is installed and signed in on this computer, the studio uses it (your Claude plan). Nothing else to set up.
- **Anthropic API key:** paste a key from the Anthropic Console (billed to that account).

The default model is Claude Opus 5.5 at "Thorough". **Test connection** checks it.

### Connecting ChatGPT

Settings includes **ChatGPT for ideas and copy** in both guided and advanced modes. The default uses the Codex CLI signed in to your ChatGPT account. Install Codex and run `codex login` once, then use **Test ChatGPT**. Claude remains connected separately and directs all operations.

The writer runs ephemerally in a temporary directory with user tool configuration disabled, a read-only sandbox, shell tools disabled and schema-constrained output. It receives the brief and relevant references, not repository access. Authentication and generation failures stop the operation; there is no silent fallback to Claude copywriting.

An explicitly selected **OpenAI text API** connection uses the configured model ID, OpenAI key and current input/output token rates. API writing is included in the production usage estimate. ChatGPT subscription calls are recorded separately because they do not have a known per-call USD cost; the USD estimate is not a subscription quota limit. Image generator settings remain separate from this text workflow.

### Real app footage

The **Footage** page holds real recordings and screenshots of the Goldcom app. Claude watches each one (screens, button labels, whether personal data is visible) and cuts them into productions.

Footage → **Film the real app** offers these sources. Claude drives any of them the same way: type a goal ("open Browse, open the 1 g bar, tap Buy gold, stop on the review screen before paying"), and Claude **rehearses** the flow screen by screen, then records **one clean take** at a natural pace with a clean status bar (09:41, full battery, no notifications) and every tap logged, so the editor can add tap ripples and camera zooms in the right places. It never confirms payments, sales or gifts and never types personal data.

- **Emulator (no phone needed):** a real Android phone with Google Play running inside your computer. Press **Install the phone emulator** once (about 2.3 GB from Google, needs ~12 GB free disk and 8 GB RAM), then **Start the phone**. The first time, sign in to the Play Store in the phone window, press **Open Goldcom in the Play Store**, install it and log in (a demo account is best). After that the phone keeps its data and starts in seconds. On Windows the studio checks that *Windows Hypervisor Platform* is on and can switch it on for you (one restart).
- **Cloud phone (Android):** a phone rented in a data centre that stays logged in. Pick the provider (GeeLark, DuoPlus, MoreLogin, Multilogin or any other with an `adb connect` address), follow the three steps shown, and paste the address (and connection code, if the provider uses one). **Compare cloud phone prices** lists prices and free trials. First time: install Goldcom from the phone's Play Store with a Google account from Oman, or press **Install app file (.apk)** if the Goldcom team gives you the app file.
- **iPhone:** Apple only lets iPhone apps run on real iPhones and Macs, so there is no iPhone emulator for Windows (xtool builds your own apps for a connected iPhone; it cannot run the App Store version of Goldcom). Without an iPhone, open a real cloud iPhone in BrowserStack App Live or TestMu AI, install Goldcom from the App Store, record your screen while you go through the flow, drop the video here and press **Crop to the phone screen**: Claude finds the phone in the desktop recording and the studio keeps only the app.
- **Any phone, recorded by hand:** record the screen (iPhone: Control Centre → Screen Recording; Android: Quick settings → Screen record), go through the flow slowly, and drop the video on the Footage page. Long recordings are split into steps automatically.
- **Android phone over USB (optional):** press **Install Android tools** once and connect the phone with USB debugging on.

### Production scenes

Claude composes with motion-designed scenes, each built for 9:16 first and adapted to 4:5, 1:1 and 16:9, in Arabic (RTL) and English:

| Scene | What it is |
|---|---|
| `hook` | Kinetic opener: the line lands word by word, gold rule, phone rising with real footage, gold bar or a character |
| `app-step` | Step badge + instruction, real footage in a phone, camera eases to each tap, tap ripples; a "tap here" hint on stills |
| `app-hero` | 3D-tilted phone (or two) slowly turning, like the App Store creatives |
| `ui-zoom` | Spotlight on one part of a real screen with a callout, camera pushes in |
| `split` | Without / with comparison: each side a lit 3D set with a person in it |
| `cast` | Meet the people: one or two 3D people standing together, with name tags |
| `moment` | A story beat: a person standing in a 3D set, narration and a speech bubble |
| `checklist` | Items tick in with gem checks |
| `title-card`, `outro` | Chapter card; logo reveal + call to action + disclaimer |

The classic templates (price board, notifications, stickers, chat, countdown, facts, myths…) remain available too.

**People:** soft-matte 3D figures with calm, natural faces (eyes that blink and follow, brows, lips) and gestures that move like people: men in dishdasha (furakha tassel) with kumma or massar, women in abaya (gold trim) with hijab or sheila, casual outfits, four skin tones and three ages. 15 poses (phone, stressed, celebrate, give and receive a gift, hold a gold bar, thinking, wave, walk, sit…), moods as body language, props held in the hand (phone, gold bar, gift box, receipts, bag, coffee). They stand in 3D sets with real window light and shadows: living room with a Muscat window, souq arcade with a glowing gold shop, office, night room, corniche at golden hour, or a seamless studio sweep, in light and dark versions. The flat illustrations remain available per layer (**Style → Flat illustration**).

**Motion engine:** keyframes on any layer, camera moves, premium phone mockups with true 3D perspective, video footage inside phones with speed ramps and holds, push / whip-pan / zoom-through / blur / gold-edged facet transitions.

**Sound:** every export gets synthesized sound design (soft whooshes on transitions, taps, notification and success chimes, logo sting) and optionally one of three music beds (calm, modern, warm Eid), mixed to −14 LUFS for Instagram. You can also leave the music off and add Instagram audio when posting.

## Creative library and originality

The library has **64 designs**: 58 new designs across 14 visual directions and six selected optional 3D examples. Filter by format and visual style. The directions include editorial photography, painted Omani stories, paper sculpture, editorial collage, visual explainers, illustrated conversations, tickets, mosaics, orbital systems, technical drawings, calendar stories, woven ribbons, visual contrasts and constructed typography. Headlines and diagram labels remain editable, including RTL Arabic.

The two image-led examples use generated editorial assets stored under `public/artwork`; they depict fictional scenes, not customers or product evidence. The remaining new illustrations render deterministically through native Canvas. New productions also compile bespoke scene ideas into bounded, declarative shapes and separately editable labels. Art-direction prose is never presented as a rendered capability: the renderer draws the compiled geometry. Reusing the same geometry with new colours is caught by the final originality check. 3D modules remain available in the editor and renderer.

**Known-work checks.** The director supplies saved designs, library hooks and reserved creative signatures to ChatGPT. Three candidate concepts must differ in visual family. Deterministic checks reject matching or close hooks and repeated combinations of metaphor, framing, motion and narrative; rejected candidates are regenerated up to three times. A file lock prevents concurrent jobs reserving identical concepts. History persists under the data directory. The final production is also checked for a repeated opening or narrative.

Explicit client format and slide-count requests take precedence over house recommendations in both planning and review.

These checks cover known local work and provide heuristic similarity detection. They cannot prove worldwide novelty or compare with projects that have never been supplied to the studio. The system must not claim that it can.

**Every slide is visual.** Text with a logo, border, gradient or decorative shape does not qualify. A substantive illustration, diagram, image, verified footage or intentional 3D scene is required, including the closing slide. This gate applies to editor and MCP exports too; old text-only designs may need artwork added before exporting. Layouts, copy, real footage and claims still pass the existing readiness checks.

**Omani Arabic.** Social copy uses natural conversational Omani Arabic, rather than formal MSA or a literal translation of English. Legal wording and real interface labels remain exact. Claude reviews the actual rendered copy; ChatGPT owns final wording, including revisions.

**Generated images and 3D models.** The wand button (and `generate_image` for Claude) picks the best available generator for the request (photo, illustration, product, texture, typography, icon) from what is set up: OpenAI and Gemini by API key, ChatGPT through the Codex CLI on a subscription, Claude (Messages API or Claude Code login) for vector art, or a 3D scene render. It learns which provider wins from your ratings, can fall back in Automatic mode, rediscovers retired model names for OpenAI and Gemini, and adds the brand's art direction to every prompt. Meshy and Tripo turn text into GLB models that the `model-showcase` scene lights and turns. The result can be placed straight into the open design. Keys are stored locally in **Generators** (key icon), masked in studio responses, and sent only to their selected service for authentication.

**Ask Claude (the director).** Give Claude a brief from the editor or the header and it works on its own with the studio's tools: plans, builds a missing capability when a brief needs one (a new visual capability, with scene-source proposals reviewed before execution), renders, checks itself against the brand and fixes what it finds. You can watch every step live. It uses your Claude Code login (your plan) unless you choose the API key.

**Repairs are reviewed.** Renderer errors are recorded without starting an agent. Start a repair explicitly; source changes are saved as proposals and run only after approval in Settings.

**It learns from you.** **Rate** a design: a thumbs-down asks why (too much text, looks generic, wrong colours…), turns the answer into a rule in `knowledge/lessons.md`, and optionally starts a revision. The production director and the MCP guide receive lessons as quoted design preferences, subordinate to brand rules and approved facts. The brain icon shows what the studio has learned, open errors and which generators win.

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
| `list_scenes` / `get_scene_source` / `test_scene` / `create_scene_module` | The 3D scene modules: browse, read, render frames to look at, and write new ones (restored automatically if the new file fails to load) |
| `generate_image` / `generate_3d_model` | Best-available image generator (OpenAI, Gemini, Codex subscription, Claude, scene render) and text-to-3D (Meshy, Tripo), optionally placed into a design |
| `get_feedback` / `add_lesson` / `read_knowledge` / `save_knowledge` | The owner's ratings and reasons, the learned rules, and research notes the studio keeps |
| `get_errors` / `resolve_error` | The self-repair inbox: renderer errors with their context |

Prompts `project_carousel` and `project_video` are also exposed as slash commands. If the studio isn't running, the MCP server builds and starts it automatically when it needs to render.

### The auditor

[`../.claude/agents/goldcom-auditor.md`](../.claude/agents/goldcom-auditor.md) is an independent reviewer. It checks visual consistency with the brand, claims and disclaimers, Instagram readiness, and whether the copy sounds human or robotic and generic ("AI slop"), in English and Arabic. The skill makes Claude run it after every design and fix what it finds. The library in this repo went through four audit passes.

## Using the studio

### Guided and Advanced workspaces

The studio opens in **Guided** mode: describe an idea, choose a format and content language, then follow its production. **More options** includes choosing the creative direction yourself and creating a campaign. Choosing a creative direction fills the brief; it does not start a paid production automatically. **More ideas** reveals additional examples.

Switch to **Advanced** at any time to reveal provider tools, the activity log, layers, motion settings, and the full editing timeline. Both modes edit the same document and preserve the selected scene. The mode and interface language are remembered in this browser. Interface language and the language of generated content are separate choices.

The production journey follows actual job stages: brief, ideas and direction, storyboard, footage, build, review, and export. Open completed material directly from the stage rail. Productions that need a concept choice, recordings, or a retry show contextual controls. When a production completes or needs attention while you are elsewhere, an in-app notification links back to it. The production journey does not invent an ETA or percentage; export progress uses the renderer’s reported value.

Core guided screens support English and Arabic with mirrored layouts. Some existing technical dialogs and provider messages remain in English. Menus, checkboxes, confirmation and rename dialogs, tooltips, and cursor graphics use Goldcom’s own design. Dropdowns are React-rendered menus, including in the advanced tools; they do not invoke browser select popups. Motion honours the operating system’s reduced-motion setting. See [workspace design notes](docs/WORKSPACE_UI.md) for the control design and verification scope.

Run `npm run test:workspace` for the isolated guided/advanced browser acceptance checks. AI-production responses in this suite are fixtures; editing and saving use the real local HTTP API.

Navigation and brief loads show an animated Goldcom task capsule and light ribbon immediately. Continuous highlights connect mode, format, and page selections. Cursor graphics are preloaded and hover effects keep their click targets fixed. Gallery thumbnail rendering is spread across frames. Run `npm run test:motion` for startup, delayed-loading, cursor-boundary, navigation-race, and responsive-motion checks.

- **Create** (home): the prompt, example requests, readiness (Claude, phone, footage) and your productions.
- **Designs:** *Your designs* and the *Library*. Filter by Posts, Carousels, Reels, Stories, Animated posts and Videos, search, switch the library between Arabic and English. Hover to play. The eye button opens the Instagram preview, the ⋯ menu duplicates, renames, exports or deletes. Press **Use** on a library card to get your own editable copy.
- **New design:** start from a starter pack in Arabic or English and pick the type: post, carousel, Reel, Story, animated post or video. Reels and Stories are always 9:16.
- **Slides:** add from the template catalog shown in the editor. Duplicate, reorder, delete.
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
npm run test:ui # 32 editor scenarios in a headless browser, best and worst cases (needs the studio running; ONLY=<regex> runs some, MEMLOG=1 prints 3D memory use)
node scripts/character-sheet.mjs   # contact sheets of every pose, mood, prop and setting
node scripts/audio-demo.mjs        # renders the sound library and a demo soundtrack
```

```
studio/
├── shared/        brand tokens, schema, templates, production scenes (scenes.js), layout helpers, library, brand lint
├── src/           React app (Create, Production, Footage, editor) · render/: canvas renderer, motion (keyframes, camera),
│                  device (3D phones), media (footage frames), extras + characters/ (flat illustrations),
│                  scene3d/ (three.js runtime, kit, 3D type, people: figure.js, sets.js)
├── server/        HTTP API + SSE · ai/ (Claude engine, pipeline, knowledge, footage indexing) · capture/ (Android driver,
│                  Claude-operated capture) · footage/ (library, scene detection, tap alignment) · render/ (MP4 export,
│                  review frames, soundtrack) · audio/ (synthesized SFX, music beds, mixer) · updater.mjs · routes/ ·
│                  generators.mjs (image/3D router) · agent.mjs (director, self-repair) · memory.mjs · modules.mjs
├── modules/       3D scene modules loaded at runtime (modules/README.md: the contract and the kit)
├── knowledge/     lessons learned, design DNA, art direction, scene backlog (read by every task)
├── mcp/           MCP server for Claude Code
├── skill/         /goldcom-studio Claude Code skill
├── samples/       documents seeded on first run
└── data/          your designs and assets (git-ignored; set GOLDCOM_STUDIO_DATA to move it)
```

Designs are plain JSON files in `data/documents/`. Every slide stores its template and content plus the generated layers, so the same file works for people, the editor and Claude.

Environment variables: `PORT` (default 5177), `HOST` (default 127.0.0.1), `GOLDCOM_STUDIO_DATA`, `GOLDCOM_STUDIO_URL` (for the MCP server), `PLAYWRIGHT_CHROMIUM_PATH`.

## Notes

- The studio is local-only. Browser requests are checked for cross-site origins and unexpected hosts. API writes require the per-install token in `<data>/.api-token`; the browser obtains it from its same-origin session endpoint, and MCP reads the local file. Screenshots block private/metadata destinations and validate DNS at connection time. Allow only specific development origins in Settings when needed.
- Studio exports render in a headless Chromium (Playwright) and encode with a bundled ffmpeg. The headless browser draws WebGL on the CPU, so 3D slides take about a second per 1080×1920 frame (a 15-second Reel with 3D scenes renders in roughly 8 minutes). Without the headless browser the editor falls back to exporting in your browser (WebCodecs).
- Claude usage: the historical audit recorded approximately $1.30–$13.46 in CLI usage estimates per draft. These are not subscription invoices or verified API charges. Configure a production budget in Settings. Claude Code receives the remaining per-call limit. The API path requires current input/output/cache rates in Settings and reserves for the call's maximum output before starting. Provider-side billing limits remain the authority for actual invoices.
- Footage recorded from a real account can show personal data and real prices. Claude flags both; check the **Before posting** notes.
- Arabic copy in the library and samples should be reviewed by a native Omani copywriter before public campaigns.
- Prices in the library are illustrative and labelled "Indicative" with a date. Library designs that show prices, countdowns or native stickers carry a **Before posting** note telling you what to update.


## Production controls

- **Ready** requires a final art-director review of the exact built version, score at least 8, no blocker issues, no brand errors, and no empty phone or image placeholders. Other drafts show **Needs attention** with reasons. The editor, MCP PNG export and server exports enforce the gate.
- Revisions preserve manually changed slides and fork editor-owned designs. Every document save keeps the previous version. **History** restores an earlier version as a new revision. Concurrent stale saves return a conflict; **Save my copy** preserves unsaved local work.
- The **Brief** tab is editable. **Rebuild with footage** uses newly supplied clips. Explicit quoted requirements are checked and repaired once; failures remain visible blockers. Feedback for a new revision replaces the previous revision instruction.
- **Create a coordinated campaign** supplies one shared brief, cast and line to each selected deliverable. The configured budget is shared among them. The studio is exclusively for Goldcom; a different client is stopped before a design is built.
- **Product facts** in Settings records the source, approver and optional expiry of approved claims. Initial facts are copied from the existing brand register, not independently verified against the live app. Current footage, product labels, claim evidence and native Arabic sign-off still require a person.
- Clips labelled sensitive, or capture steps with personal-data regions, are excluded from production. Automated capture refuses payment/confirmation controls and unlabelled coordinate taps; replay rechecks the live target. Real-device acceptance testing is required before relying on capture in an account.
- Scene metadata is parsed statically; the server never imports submitted scene code. New or repaired source waits under **Settings → Scene proposals** for source review and approval. Approved source is trusted browser JavaScript, not a sandbox. Renderer telemetry does not start agents. Explicit director tasks have restricted MCP tools, a spending limit and no built-in shell/file tools; paid image generation is requested through the editor.
- Selecting an image provider is binding. Automatic mode can fall back; fatal authentication, billing and safety failures stop the request. Background images retain provider provenance for rating feedback. OpenAI and Gemini implement model discovery; other provider models are configured manually.
- Export jobs survive restart as interrupted jobs. Restart the export explicitly. Cancellation cannot mark a production Ready; frame evaluation has a 45-second timeout.
- Updates require a Git checkout and a trusted SSH allowed-signers file configured in Settings. Signatures are verified before changes are applied. Local tracked edits are restored before the build, with a backup stash retained. Git rollback restores the earlier code if the build fails. Archive installations cannot update in place; move to a Git checkout while preserving the data directory. No plain-ZIP rollback is promised.

## Checks

```sh
npm run lint
npm run typecheck
npm run test:unit
npm run test:creative
npm run test:http
npm test
npm run test:ui
npm run build
npm audit
```

The integration commands create disposable servers, data, modules and knowledge folders. They do not use the owner's running instance. The type-checking baseline covers the hard-constraint and capture-safety modules; the rest of the application remains JavaScript and is linted. Live model calls and device/account tests are separate from these suites.

Native API clients send `Authorization: Bearer <contents of data/.api-token>` for writes. For isolated development use `GOLDCOM_STUDIO_DATA`; integration harnesses additionally set `GOLDCOM_STUDIO_MODULES` and `GOLDCOM_STUDIO_KNOWLEDGE`.
