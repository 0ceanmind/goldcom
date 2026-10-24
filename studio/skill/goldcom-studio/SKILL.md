---
name: goldcom-studio
description: Design on-brand Goldcom carousels, social posts, animations, videos and app-store screenshots in the Goldcom Studio, about the current project or any topic. Use when the user asks for a carousel, post, slide, reel, story, video, animation, launch visuals, app screenshots or marketing creative "in the Goldcom style/brand", or invokes /goldcom-studio. Requires the goldcom-studio MCP server.
---

# Goldcom Studio

You design with the **goldcom-studio** MCP tools. Every design lands live in the Goldcom Studio web app, where the user can edit every word and layer and export PNG, ZIP, MP4 or GIF. Your job is to supply the story, the copy and the real visuals. The templates handle layout, colour and type in the Goldcom identity.

If the `goldcom-studio` tools are not available, tell the user to run `npm run connect` inside the `studio/` folder of the Goldcom repo (or `claude mcp add goldcom-studio --scope user -- node <path>/studio/mcp/server.mjs`), then restart Claude Code.

## 0. Prefer the studio's AI production pipeline for finished content
For a complete Reel, carousel, Story or post about Goldcom (e.g. "step-by-step reel on how to buy gold", "carousel of two people with and without Goldcom"), call `produce` with the user's request. The studio then writes the brief, explores three concepts, lets a creative director pick one, storyboards it, uses REAL app footage from the library (or films the app on a connected Android phone), builds it with the production scenes, has an art director review rendered frames, applies the fixes and renders the MP4. Poll `production_status` every minute or two (a production takes about 5–10 minutes) and hand over the production URL, the design link, the video link, the art-director score and the "before posting" notes. Use `revise_production` for follow-up changes.
- `list_footage` shows the app recordings available; `import_footage` adds a recording or screenshot from a path.
- `export_video` renders any design to MP4 on the server (frame-exact, with sound effects).
Use the manual workflow below for designs about other projects, or when the user wants hands-on control.

## 1. Load the rules
Call `studio_guide` first, every session. It returns the brand rules (voice, claims register, colours, Arabic rules), the templates with their fields, and the formats and themes. Follow it over anything here if they differ.

## 2. Understand the subject
When the design is about the current project, study it before writing anything:
- Read `README*`, `package.json` / `pyproject.toml` / `Cargo.toml`, the main entry points, routes or pages, and `git log --oneline -20`.
- Pull out: the **one-line promise**, the **problem** it solves, **3–5 features** a user would care about, **proof** (real numbers you can verify in the repo: tests, performance, counts), **who it is for**, and **where to get it** (URL, store, repo).
- Never invent metrics, customers or claims. If there is no proof, use a list or code slide instead of a stat.

## 3. Get real visuals (live screenshots)
If the project has a UI:
1. Find how to run it (scripts in package.json, README). Start the dev server in the background and wait until it answers.
2. Call `capture_screenshot` for the key screens: `device: "phone"` for mobile or responsive UIs, `device: "desktop"` for web apps and dashboards. Use `selector` to capture a single component and `wait_ms` if data loads slowly.
3. Use the returned `/assets/...` URL as `content.screenshot` (with `device: "phone"` or `"browser"`), or pass `attach_to` to place it into an existing slide.
4. Stop any server you started when you are done.
Existing images in the repo (screenshots, logos, diagrams) can be imported with `add_asset({ path })`.

## 4. Start from the library when it fits
`list_library` returns ready-made, audited Instagram designs (posts, carousels, Reels, Stories, animated posts, a video). When the request matches one (a price update, a gift idea, a how-it-works carousel, a poll Story…), call `create_from_library` and adapt it with `edit_slide` and `set_caption` instead of starting from nothing.

## 5. Plan the story
Goldcom posts mostly on **Instagram**. Pick the kind first:
- `post` (4:5 feed image) · `carousel` (swipeable 4:5 slides) · `motion` (one animated 4:5 slide, exported as MP4) · `reel` (one 9:16 video) · `story` (separate 9:16 frames).
- Reels and Stories use format `story`. Templates keep text out of the Instagram interface (Reels: top 220 px, bottom 420 px; Stories: top 250 px, bottom 260 px). Feed posts are cropped to 3:4 on the profile grid, so keep text off the side edges.

Use one idea per slide and titles of 8 words or fewer. Default recipes:

**Project carousel (7 slides, feed-portrait):** `cover` (promise + screenshot) → `statement` (problem) → `feature` × 2 (with screenshots) → `list` or `code` (what is inside / how it works) → `stat` (only with real proof) or `comparison` → `cta`.

**Reel (15–25 s, kind "reel"):** `kinetic` 3 s (hook, words land one by one) → `cover` or `notification` 4 s → `feature`/`screenshot` 4 s → `goal`, `chat` or `live-price` 4 s → `cta` 4 s → optional `logo-sting`. Vary transitions: fade, slide, wipe, zoom. Use `bgMotion: "drift"` on dark slides.

**Story (3–5 frames, kind "story"):** a hook frame, a `sticker` frame (poll, quiz, slider, question or countdown) with `native: "yes"` so the user adds Instagram's own tappable sticker on top, then a `cta` frame. Mention the sticker in `notes`.

**Single post:** one `cover`, `stat`, `quote`, `fact`, `myth`, `karat` or `price` slide with kind "post" (or "motion" for an animated version).

**App-store set:** format "appstore", `cover` slides on theme "bullion", one message per screenshot.

Theme rhythm: mostly `onyx`/`charcoal`, one `cream` slide for contrast, `bullion` for one campaign moment, and end on `onyx`.

### Make it feel live
The live templates are what make Goldcom content feel current rather than static: `live-price` (animated price board, always badged Indicative and dated; never call a posted price "live"), `notification`, `countdown`, `chat`, `goal`, `kinetic`, `logo-sting`, `sticker`. Use at least one in every Reel and animated post. Never show invented results: no poll percentages, user counts or testimonials. Prices are illustrative, so add `notes: "Update the price before posting"`.

## 6. Write the copy
- Language: **Arabic (`lang: "ar"`) by default** for Goldcom's Omani audience, or English when the user asks or the audience is international. Write Arabic natively in Modern Standard Arabic, not as a translation, and say that new Arabic copy should be reviewed by a native speaker.
- Voice: fact first, then feeling. Calm, precise and warm. No hype, no urgency, no exclamation marks in buttons.
- Sound human. Never use filler such as "unlock", "elevate", "seamless", "journey", "game-changer", "empower", "dive in", "whether you're… or…", "it's not just X, it's Y". Prefer concrete nouns and real numbers, and don't reuse the same CTA on every design.
- Use `*one or two words*` in a title for the gold accent.
- Claims: never "guaranteed", "risk-free", "best price" or "fully regulated". Amber claims (insured, licensed, Sharia-certified, vault) only with wording the user has approved.
- Any price, return, "invest" or "save" → disclaimer (use the `price` template, or `cta` with `disclaimer: "yes"`).
- Caption: the first line is the hook, then one or two short lines, at most one emoji and 3–5 relevant hashtags. Pass it as `caption` to `create_design` or set it with `set_caption`.
- For projects that are not about gold: keep the Goldcom identity (logo, colours, type, voice) but do not add gold claims.

## 7. Build, check, refine
1. `create_design` with name, format, kind, lang, slides, caption and notes. It opens the studio in the browser.
2. Read the returned `brand_check` and fix every `[error]` and `[warn]` with `edit_slide`.
3. `render_preview` and look at every slide: text fit, hierarchy, screenshot crop, theme rhythm, Arabic direction. Refine with `edit_slide` (content is merged; `template` and `theme` can change).
4. If the user has hand-edited a slide, `edit_slide` only updates text and media. Do not pass `force_layout` without asking.
5. Optional: `export_pngs({ out_dir: "marketing/carousel" })` saves full-size PNGs into the project.

## 8. Audit (required)
Every design is reviewed by the **goldcom-auditor** agent before you hand it over. Launch it with the Task/Agent tool (`subagent_type: "goldcom-auditor"`), giving it the design id(s) and the rendered PNG paths. It checks visual consistency, claims, Instagram readiness, and whether the copy sounds robotic or like AI filler in English and Arabic.
- Fix every **blocker** and **should fix** item, re-render, and run the auditor again until the verdict is PASS or PASS WITH FIXES with only nice-to-haves left.
- If the agent is not installed, run `npm run connect` in the studio folder, or do the same review yourself against its checklist and say so.

## 9. Hand over
Reply briefly with: the studio link, the slide list (one line each), the auditor's verdict, which screenshots you captured, any claims or Arabic copy that needs human sign-off, anything in `notes` (prices to update, native stickers to add), and how to export (Export menu → PNG, ZIP, MP4 or GIF; the **Preview** button shows it in an Instagram phone mock-up first).
