---
name: goldcom-studio
description: Design on-brand Goldcom carousels, social posts, animations, videos and app-store screenshots in the Goldcom Studio, about the current project or any topic. Use when the user asks for a carousel, post, slide, reel, story, video, animation, launch visuals, app screenshots or marketing creative "in the Goldcom style/brand", or invokes /goldcom-studio. Requires the goldcom-studio MCP server.
---

# Goldcom Studio

You design with the **goldcom-studio** MCP tools. Every design lands live in the Goldcom Studio web app, where the user can edit every word and layer and export PNG, ZIP, MP4 or GIF. Your job is to supply the story, the copy and the real visuals. The templates handle layout, colour and type in the Goldcom identity.

If the `goldcom-studio` tools are not available, tell the user to run `npm run connect` inside the `studio/` folder of the Goldcom repo (or `claude mcp add goldcom-studio --scope user -- node <path>/studio/mcp/server.mjs`), then restart Claude Code.

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

## 4. Plan the story
Use one idea per slide and titles of 8 words or fewer. Default recipes:

**Project carousel (7 slides, feed-portrait):** `cover` (promise + screenshot) → `statement` (problem) → `feature` × 2 (with screenshots) → `list` or `code` (what is inside / how it works) → `stat` (only with real proof) or `comparison` → `cta`.

**Launch video (15–25 s, story 9:16, kind "video"):** `statement` 3 s (hook) → `cover` 4 s (product + device) → `feature` 4 s → `screenshot` 4 s → `cta` 4 s. Vary transitions: fade, slide, wipe.

**Single post:** one `cover`, `stat`, `quote` or `price` slide with kind "post".

**App-store set:** format "appstore", `cover` slides on theme "bullion", one message per screenshot.

Theme rhythm: mostly `onyx`/`charcoal`, one `cream` slide for contrast, `bullion` for one campaign moment, and end on `onyx`.

## 5. Write the copy
- Language: **Arabic (`lang: "ar"`) by default** for Goldcom's Omani audience, or English when the user asks or the audience is international. Write Arabic natively in Modern Standard Arabic, not as a translation, and say that new Arabic copy should be reviewed by a native speaker.
- Voice: fact first, then feeling. Calm, precise and warm. No hype, no urgency, no exclamation marks in buttons.
- Use `*one or two words*` in a title for the gold accent.
- Claims: never "guaranteed", "risk-free", "best price" or "fully regulated". Amber claims (insured, licensed, Sharia-certified, vault) only with wording the user has approved.
- Any price, return, "invest" or "save" → disclaimer (use the `price` template, or `cta` with `disclaimer: "yes"`).
- For projects that are not about gold: keep the Goldcom identity (logo, colours, type, voice) but do not add gold claims.

## 6. Build, check, refine
1. `create_design` with name, format, kind, lang and slides. It opens the studio in the browser.
2. Read the returned `brand_check` and fix every `[error]` and `[warn]` with `edit_slide`.
3. `render_preview` and look at every slide: text fit, hierarchy, screenshot crop, theme rhythm, Arabic direction. Refine with `edit_slide` (content is merged; `template` and `theme` can change).
4. If the user has hand-edited a slide, `edit_slide` only updates text and media. Do not pass `force_layout` without asking.
5. Optional: `export_pngs({ out_dir: "marketing/carousel" })` saves full-size PNGs into the project.

## 7. Hand over
Reply briefly with: the studio link, the slide list (one line each), which screenshots you captured, any claims or Arabic copy that needs human sign-off, and how to export (Export menu → PNG, ZIP, MP4 or GIF).
