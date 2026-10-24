# Studio knowledge

What the studio knows and has learned. Claude reads this folder through `studio_guide` and `read_knowledge` at the start of every task, and writes to it as it learns.

| File | What it is | Who writes it |
|---|---|---|
| `lessons.md` | Rules learned from your feedback and from mistakes. Overrides defaults. | Claude via `add_lesson` after feedback or a self-repair; you can edit it |
| `design-dna.md` | What studio-grade means here: research on Tendril, ManvsMachine, BUCK, DIA, Giant Ant, Ordinary Folk, Stash and Motionographer, production rules, 24 Goldcom concepts and the "never do" list | Research (2026-10-24) |
| `art-direction.md` | House notes added to every image-generation prompt | You or Claude |
| `scene-backlog.md` | Concepts not built yet; the director builds them when a brief needs one | Claude |
| `research/*.md` | Techniques and references Claude looked up, saved so it does not search again | Claude via `save_knowledge` |

Raw events (every rating, error, generation and director run) stay local in `studio/data/memory/` and are not committed.
