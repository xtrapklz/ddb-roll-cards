# Ability Automation — Design & Roadmap (Cavril: Core)

How we turn an SRD ability's mixed structured data + prose into reliable, à la carte
card actions — and the plan for the gaps. Written 2026-06 after the Giant Spider bite case.

---

## The problem we're actually solving

5e abilities have **inconsistent rules wrapped around interconnected mechanics**. A single
"Bite" can be any of these, and the text rarely signals which in a uniform way:

- hit → damage
- hit → damage **+ a condition** (no save) — *grapple*
- hit → damage **+ a save-OR-condition** — *bite: CON save or poisoned*
- hit → damage **+ a save-for-HALF-damage** — *Giant Spider: CON save for half poison*
- **conditional / special** — *paralyzed ONLY if reduced to 0 HP* — narration, not a rule we apply
- a pure save-based AoE — *Fireball: DEX save for half* (no attack)

We cannot fully automate everything. The goal is the opposite of "automate or nothing":
**reliably surface every KNOWN mechanical element as a grabbable card action**, and stay
silent (or narrate) on the parts we can't read.

---

## Principle: structured-first, text-as-supplement, narrate-the-rest

1. **Structured data is the source of truth.** dnd5e parses each item into *activities*
   (attack / save / damage / heal) carrying: to-hit, damage parts (formula + type), save
   `dc`/`ability`/`onSave` (half|none), and conditions (via the item's own effects). Read
   these first — they're reliable and need no parsing. (`resolveAction`.)
2. **Text is the fallback, parsed methodically — never loosely.** Use it only for what the
   structure misses (text-only saves, the save↔condition relationship, extra formulas), with
   **anchored** patterns. Loose substring matching is what produced "Applies on hit: Paralyzed"
   on a conditional paralysis. Every text rule must be anchored to an explicit cue
   (`DC N <ability> save`, `XdY <type> damage`) and **gated against contingent clauses**.
3. **Contingent effects are GM narration, not applied rules.** "if reduced to 0 HP", "while
   poisoned", "in this way" → don't auto-apply; leave them in the description for the GM.

---

## The à la carte card model

Each card exposes the known elements as independent, grabbable controls:

| Element   | Control on the card                          | Apply path |
|-----------|----------------------------------------------|-----------|
| To-hit    | per-target hit/miss + Confirm hits           | `defaultHit` / verdicts |
| **Save**  | ONE "Roll save" prompt (`masteryStrip`)      | `rollMasterySave` |
| Damage    | Apply all + per-target portion (−1/0/¼/½/1/2)| `applyAll` (reads `tgt[k].mult`) |
| Condition | chips, apply on hit/fail; ✕ to drop          | `featureOnHitRiders` / chips |
| Special   | shown in the description only                | — |

The **Save prompt is the keystone** — it's the user's "present the save as a button". One
uniform strip now covers *both* a save-or-condition and a save-for-half, because the save's
result simply drives whichever effect the ability has.

---

## What shipped (4.114–4.115) — the unified save engine

`featureRiderSave` is now the single attack-save classifier. On a hit it sets ONE
`card.atk.masterySave = { dc, ability, cond, onSave, targets, results }`:

- **save-OR-condition**: `descRiderSave` (text "DC N save or X") OR a structured save + an
  on-hit condition. `cond` set, `onSave` null. Roll → condition applied on a fail.
- **save-for-HALF-damage**: a structured save with `saveOnSave==='half'`. `cond` null,
  `onSave='half'`. Roll → per-target damage **portion** set (½ on a save, full on a fail) via
  `card.tgt[k].mult`, which `applyAll` already reads. *(This was the Giant Spider gap — the
  attack card had no `card.save`, so the ½ never applied.)*
- Reliability: fires on a **structured** save even when the text isn't phrased "DC N save", and
  doesn't latch `riderSaveHandled` until a hit is actually found.

`itemConditions` got a **contingent-gate** check (wider window): a condition inside
`if … reduces … to 0`, `while <state>`, or `in this way` is skipped — so conditional paralysis
no longer false-flags, while "the target is poisoned until …" still does. (Verified vs the
screenshot text + a control.)

The old manual "Condition / When" picker (`condSec`) is hidden whenever the auto engine owns
the card — one contextual control, not two.

---

## Roadmap — proposed, for your review before I build

These are the next reliability + à la carte wins. Ordered by value/effort.

1. **Per-part damage saves (the real Giant-Spider nuance).** A save-for-half should halve only
   the SAVE-GATED damage part (the *poison*), not the piercing too. Today `tgt[k].mult` scales
   the whole damage, so a mixed attack's non-save part is also halved. Fix = let the save mark a
   *part-scoped* portion; `applyAll` already iterates parts. Medium effort, removes the one
   approximation in the save engine.
2. **À la carte damage formulas from text.** Parse `N (XdY) <type> damage` / `XdY <type> damage`
   as a FALLBACK when the structured damage is missing or a secondary rider damage isn't modeled
   ("the target takes an extra 1d6 fire"). Surface each as a "Roll 1d6 fire" chip that rolls +
   posts (GM applies). Low risk because it's fallback-only; never duplicates structured parts.
3. **Branch-aware effects.** Split each element into its on-hit / on-fail / on-save branch and
   label it ("on a fail: prone · on a save: half") so the card reads like the stat block.
4. **One `extractBeats(item)`** that returns the full normalized beat list (`saves[]`,
   `damages[]`, `conds[]`, `specials[]`) so every surface (card, cinematic, log) renders from one
   classification instead of several feature functions racing on the same hit.
5. **A tiny known-monster override table** for the handful of SRD attacks whose prose defeats any
   regex (the truly bespoke ones), keyed by name — the 99% comes from structure+text, the last 1%
   from a curated map.

The throughline: **lean on structure, anchor the text, gate the contingent, narrate the rest** —
and present every reliable beat as its own button.
