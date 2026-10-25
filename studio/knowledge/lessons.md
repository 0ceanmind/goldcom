# Lessons learned

Rules the studio has learned from feedback and mistakes. Every task reads this file first (`studio_guide`), and it overrides the defaults. The director adds to it with `add_lesson`; you can edit it by hand. Newest first within each section.

## Visual
- People must look normal in the small details, because viewers sense "something is wrong" before they can say what. Faces in real proportions: an eye is about a fifth of the head's width, the eyes sit on the head's midline, the mouth about a third of the way from nose to chin. Tiny eyes high up read as a potato or a doll. _(why: "their hands, their expressions doesn't look proper, their movements… we should focus on the little small details", owner, 2026-10-25)_ <!-- feedback, 2026-10-25 -->
- Hands hold things: fingers wrap behind a phone with the thumb on the screen, a bar or card shown to the viewer sits in front of the fingers with the thumb on its lower corner, a bag hangs from hooked fingers. A resting thumb lies along the index finger, never splayed. <!-- feedback, 2026-10-25 -->
- People are 3D figures standing in lit 3D sets (`people` scene, `kit.figure`) with calm faces in real human proportions. Never draw people with emoji faces, blush cheeks, open grins or stiff A-poses. _(why: "the characters looks suck they don't look good at all", owner, 2026-10-24)_ <!-- feedback, 2026-10-25 -->
- A person and their setting share one 3D stage (one light, real shadows on the floor). Do not stack a flat person on a separately drawn room. <!-- self-review, 2026-10-25 -->
- Pick poses that read from across the room (give-gift, phone-happy, thinking, celebrate, wave). Check the silhouette: a resting hand that floats beside the body reads as a different gesture. <!-- self-review, 2026-10-25 -->
- Show the idea with one strong visual and at most one short line. A slide that needs a kicker, a headline and a subline to make its point is the wrong visual. _(why: "the designs are focusing more text, and that's not actually good for social media", owner, 2026-10-24)_ <!-- feedback, 2026-10-24 -->
- Gold is reflective metal under studio light: use the 3D scenes (polished field, frosted stamp, strip highlights, contact shadow), never a flat yellow shape with a highlight stripe. _(why: the old flat gold bars and phones looked cheap, "not a professional designs level")_ <!-- feedback, 2026-10-24 -->
- No scattered sparkles, stars, glints or confetti particles. If a frame needs life, give it motion (camera drift, a light sweep, a landing), not decoration. _(why: the owner called the old look "AI slop")_ <!-- feedback, 2026-10-24 -->
- Every object keeps real proportions and sits in the scene with a contact shadow or reflection; nothing floats unexplained. _(why: "every detail must look perfect in every design")_ <!-- feedback, 2026-10-24 -->
- Keep pattern wallpaper (the facet pattern) out of visual-first slides; negative space is light on onyx, not texture. <!-- design-dna, 2026-10-24 -->

## Motion
- People move like people: a gesture starts from rest and travels on an arc with the elbow bent (never through a T-pose), the hand arrives a beat after the arm, the head and eyes follow, then it settles. Idle motion is irregular (glances, weight shifts, blinks on uneven timings), never a sine-wave loop. <!-- feedback, 2026-10-25 -->
- Heavy things move slowly and land decisively (settle ease, at most ~3% overshoot). No elastic or bouncy easing on metal. <!-- design-dna, 2026-10-24 -->
- The camera never fully stops: a slow push-in or drift keeps a still frame alive. <!-- design-dna, 2026-10-24 -->

## Scenes
- When judging motion, look at a strip of frames over time, not one still; and when judging details, render a close-up (people scene framing: 'portrait'). Small-thumbnail reviews hide exactly the flaws viewers notice. <!-- self-review, 2026-10-25 -->
- Keep the people camera level (lookAt at camera height) so walls and doors stay vertical, and place feet with floorAt instead of tilting the camera. <!-- self-review, 2026-10-25 -->
- Skinned meshes (robes, sleeves, hijab) need `frustumCulled = false`, and every scene must stay inside the runtime memory budget: build meshes once in create(), never per frame. <!-- self-repair, 2026-10-25 -->
- Fog distances are measured from the camera: set them from the camera distance (dist + n), or a light set washes out completely. <!-- self-review, 2026-10-25 -->
- Never scale a mesh to (near) zero to hide it: degenerate normals produce NaN pixels that bloom smears across the frame. Hide it with `visible = false` and keep scale ≥ 0.03. <!-- self-repair, 2026-10-24 -->
- Flat gold faces that point straight at the camera mirror the dark room and read brown. Tilt them back 0.1–0.2 rad, or angle them, so they catch the top-back key and the front softbox. <!-- self-repair, 2026-10-24 -->
- Avoid `anisotropy` on rounded-box geometry (bad tangents → NaN pixels). Use roughness for a brushed look. <!-- self-repair, 2026-10-24 -->
- Point lights close to polished surfaces make hot spots that read as glare. Keep practical lights high, broad and dim, or use emissive strips. <!-- self-repair, 2026-10-24 -->

## Arabic
- Pick one digit system: Western digits (0–9) everywhere, including text stamped on 3D objects. <!-- self-review, 2026-10-24 -->
- In mixed Arabic + Latin strings (e.g. "شراء 1 g"), isolate the Latin run with U+2066 … U+2069 so bidi keeps "1 g" in order. <!-- self-review, 2026-10-24 -->
- Animate Arabic by word or by line, never letter by letter (it breaks the joined script). <!-- design-dna, 2026-10-24 -->

## Process
- When a capability is missing, build it (new scene module, research notes) instead of falling back to a text slide. <!-- owner brief, 2026-10-24 -->
- When the owner is not satisfied, ask why, turn the answer into a rule here, then fix the design. <!-- owner brief, 2026-10-24 -->

## General
- After writing or repairing a scene module, check every `kit.*` member against studio/modules/README.md (e.g. `kit.materials`, not `kit.materails`). A misspelled kit namespace only fails at render time, so always run test_scene before finishing. <!-- claude, 2026-10-24 -->
