# Goldcom Studio workspace update

The workspace follows the approved dark-and-gold design direction. The shared shell, guided creation, production journey, simplified editor, media library, and guided settings use the existing React stack and brand tokens. The advanced editor, claims checks, provider connections, approval controls, and export pipeline remain available.

## Interaction and state

- Guided mode is the default; mode and interface language persist in browser storage.
- Mode changes preserve the document, selected scene, and unsaved edits.
- Interface language is separate from the output language. Core guided screens have Arabic copy and RTL layouts. Existing technical/provider panels retain some English strings.
- The production rail groups concept generation and direction into Ideas. Initial footage indexing stays at the beginning of the rail so it cannot falsely mark later steps complete.
- Stage cards contain real concepts and storyboard text. Their decorative icons are illustrative; the actual rendered result appears in a separate preview when a document exists.
- Export percentages come from the job or browser renderer. A job without reported progress gets an indeterminate state. No invented ETA is shown.
- Notifications use the existing SSE connection. Completed productions and requests for attention link back to their production page.
- Reduced motion affects CSS transitions and automatic canvas previews. Dialogs support focus containment, Escape, and focus restoration.

## Goldcom controls and refinements

The creation screen uses a compact editorial list of creative directions. Long example prompts live behind **More ideas**. The earlier image cards are no longer displayed on the creation screen.

`SelectControl` renders a button and a portal-mounted listbox; no native select element or browser picker is used. It supports pointer selection, arrow keys, Home/End, typeahead, Escape without committing, and Tab. Menus track their anchors when the workspace scrolls, flip above controls near the bottom of the viewport, and inherit the active LTR/RTL direction. The shared editor controls and raw selectors in settings, capture, production briefs, and the shell all use this component.

Checkboxes and radio controls have custom CSS artwork. Text selection, focus treatments, and caret colour follow the palette; browser textarea resize grips and number spinners are removed. Goldcom dialogs handle confirmation and renaming instead of `window.confirm` and `window.prompt`. Goldcom tooltips replace title balloons and preserve accessible labels.

The SVG cursor family in `public/cursors/` covers default, action, text, move, diagonal resize, and unavailable states. Cursor images are applied directly through CSS, so there is no JavaScript cursor-following loop. The source SVGs are original code-native graphics and do not redraw the Goldcom logo.

## Loading and motion

Cursor assets are preloaded from the document head. Legacy cursor declarations and inline overrides use the same cursor variables; decorative children inherit their control’s cursor. Clickable cards and buttons keep fixed hit areas during hover. Preview artwork may scale inside those areas without moving the target underneath the pointer.

The HTML document contains a small Goldcom loading composition before React or the application script arrives. Navigation paints an animated light ribbon and task capsule before awaiting saves, document loads, or library updates. Even a fast navigation has a short visual settling transition; this is presentation timing, not a fabricated progress estimate. Reduced-motion mode keeps the loading status while removing repeated and sliding animation.

The workspace, format buttons, mode switch, gallery filters, and production tabs use continuous measured selection highlights. Their measurements update for translated labels, responsive wrapping, and delayed content. Late document responses and background document updates cannot replace a newer navigation.

Static canvas previews are scheduled in small batches between frames. Cards show a Goldcom preparation state until their first scheduled draw finishes. This avoids drawing an entire gallery synchronously in one effect flush. A single expensive scene can still exceed the queue’s frame budget; actual frame rate depends on its rendering cost and the machine.

`npm run test:motion` checks cold startup with the application script deliberately held, stable cursor targets, feedback during a delayed document fetch, navigation races, short transitions, RTL/mobile selection alignment, and reduced motion.

## Artwork

Saved asset: `public/artwork/studio-starters.png`.

Generated with the built-in image-generation tool, not the API/CLI fallback. The previous triptych is retained as a project asset but is no longer shown on the creation screen following the requested refinement. It is decorative artwork, not a photo of a Goldcom product or verified app screen. The asset contains no product markings, serial numbers, or price claims.

Final generation prompt:

> Use case: product-mockup. Create one premium photographic triptych image to be used as the background artwork of THREE UI starter tiles in Goldcom Studio, a dark creative production app. Very wide canvas, exact aspect ratio 3:1, three SQUARE equal-width panels seamlessly adjacent left, middle, right, NO gutters or borders. Each panel is its own separate studio still life composed independently and centered inside that third, leave safe space around its edges because CSS will display each square panel individually. All three share near-black #151513 background, sophisticated restrained warm gold metallic highlights, real photographic materials, subtle reflections and gorgeous soft directional studio lighting, calm premium app-store art direction. LEFT THIRD: one small elegantly wrapped metallic gold gift box, matte dark gold ribbon and bow, box centered in the square, around 65% of panel height. MIDDLE THIRD: a modern black smartphone with softly rounded corners standing at a modest three-quarter angle, screen contains ONLY minimal abstract gold UI blocks on black, with one small plain unmarked gold bar standing next to it. RIGHT THIRD: two elegant plain minted gold bars, one standing and one lying at an angle on a dark surface, softly reflecting each other. Plain unmarked metal: absolutely NO writing, NO letters, NO numbers, NO purity stamps, NO serial numbers, NO maker marks, NO logo, NO currency symbols, NO watermarks. These are illustrative editorial objects for a creative app, not a real product catalogue. Each object complete and uncropped inside its own square third. Very high quality metal reflections without harsh flares or glitter. NO UI screenshots, NO captions, NO text at all.

## Verification

`npm run test:workspace` exercises guided creation, backend stage mapping, choosing a concept, stop/continue, blockers, errors, interrupted work, completion, mode persistence, RTL, responsive layouts, dialog focus, media capture disclosure, real document saving, scene preservation, reduced motion, and missing-job recovery. It runs against isolated data and mocks AI-production responses, so it does not spend provider credits. It saves screenshots when `GOLDCOM_QA_OUT` names a persistent folder.

`npm run test:ui` exercises the full advanced editor and actual exports. The existing regression and HTTP suites cover document concurrency, claims and approval checks, missing footage, budgets, and access controls. Browser acceptance does not establish that a paid provider production succeeds with a particular account or that all animations maintain a fixed frame rate on every device.
