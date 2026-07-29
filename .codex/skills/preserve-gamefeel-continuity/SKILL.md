---
name: preserve-gamefeel-continuity
description: Preserve perceptual continuity while designing or changing sentence-shooter gameplay, Canvas visuals, animation, projectiles, rewards, timing, speed, density, or A/B variants. Use for any task that can change how the game looks or feels, when interpreting user feedback about a specific effect, when preparing an A/B test, and when handing this work to another agent.
---

# Preserve Gamefeel Continuity

Treat visual form, motion, timing, density, sound timing, spatial layout, and input response as one coupled gamefeel baseline. Do not assume text descriptions can preserve that baseline.

## Start from evidence

1. Run the repository resume gate and read `AGENTS.md` fully.
2. Read [visual-baselines.md](references/visual-baselines.md).
3. Inspect every referenced PNG before changing the related system.
4. Capture the current implementation at the same viewport, seed, and game state before editing.

If the approved state cannot be reconstructed visually, do not invent a replacement from prose. Report exactly which visual evidence is missing.

## Resolve the user's speech act first

Classify the current message before taking action:

- A question asks for a factual answer. Answer it before researching broadly, editing, delegating, or proposing policy.
- An observation supplies evidence; it does not automatically request a change.
- An idea opens a design possibility; it does not erase adjacent decisions.
- A selection chooses an A/B direction; it does not silently approve every detail in that variant.
- A change request authorizes only the named scope.

Lock narrow referents such as “그 발사체” to the concrete object under discussion. If corrected, discard the previous interpretation instead of expanding it.

## Preserve a perceptual control

Before a design edit, name the coupled baseline:

- silhouette and apparent size
- palette, glow, contrast, and threat readability
- trail, particles, and density
- velocity, acceleration, cadence, warning delay, and lifetime
- screen position, camera composition, and HUD relationship
- input-to-action, contact, impact, and death timing

For A/B work, keep at least one perceptual control that still embodies the last known baseline. Change the experimental axis strongly enough to produce useful feedback, but never replace the same baseline in both variants without explicitly saying so first. If the user requests two fresh concepts, preserve the agreed common layers and make the changed layers visually identifiable.

Do not treat a renderer as disposable merely because its data model or simulation changed.

## Use visual golden masters

Store durable visual evidence under `assets/`:

- Use a full-frame PNG for composition, density, color, and HUD hierarchy.
- Use a transparent sprite PNG for a reusable silhouette or effect.
- Use a horizontal frame strip for motion: pre-action, contact or transition, and fixed millisecond offsets.
- Use a side-by-side A/B plate rendered with the same seed, viewport, and game state.
- Keep rejected or experimental imagery separate from locked imagery. Never relabel an experiment as rejected merely because an uncommunicated replacement was criticized.

PNG preserves appearance but not motion by itself. Pair it with frame timestamps and measured positions. Treat a change in spacing across timed frames as a speed change even when the object shape is unchanged.

Before finishing, compare new captures against the golden masters. Report visible deltas, not only code deltas.

## Communicate the delta before implementation

For any change that affects gamefeel, send a short statement in this form:

`유지: … / A 변경: … / B 변경: … / 예상 감각 변화: …`

Do not turn this into an approval ceremony. Its purpose is to keep the experiment legible and let the user notice when an adjacent layer is being changed.

After implementation, show the before/after or A/B image plate and state which exact baseline elements moved. Do not claim that the game feels better; only the user judges that.

## Handle corrections without widening

When the user says the answer missed the point:

1. Stop extending the old interpretation.
2. Restate the corrected object and question in one sentence only when needed.
3. Answer that narrow question immediately.
4. Resume implementation only if it was actually requested.

Do not recast accumulated frustration as a request to stop, reset everything, or enter a “recovery” process.

## Hand off transparently

Label messages to another task as `에이전트 작성 인계 메모` and distinguish them from the user's own words. Never write an assistant interpretation in the user's voice. State whether the message is context, a request for inspection, or an authorized implementation instruction.

## Canonical example

The round-to-arrow incident is about continuity, not a ban on arrows:

- Baseline: a harmless yellow round projectile visibly arms into a red round projectile while preserving object identity, silhouette, and short velocity trail.
- Uncommunicated change: a refactor sampled internal heat particles, created new `heatArrow` objects, and replaced the renderer with pointed polygons in both A/B variants.
- Failure: object identity, silhouette, motion language, and speed impression changed together, so the user could no longer compare the experiment to the prior gamefeel.
- Correct A/B treatment: keep the round transformation as the control and test the arrow silhouette in the experimental variant, or explicitly name a different comparison axis. The arrow itself remains a valid candidate.

Project status after that comparison: on 2026-07-29 the user explicitly selected the A round projectile for both live variants and ended the arrow experiment. This later choice overrides the historical example in sentence-shooter until the user reopens that axis.
