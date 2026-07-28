# Trace regression fixtures

- `resize-overlap-before.json`: real 14-second pipeline-4 session. A resize from 844.5px to 328.5px compressed the formation; the analyzer must find 61 overlapping samples, at most 9 simultaneous pairs, and 2769px² maximum overlap.
- `resize-recovery-after.json`: real 34-second pipeline-4 session after the portable resize fix. The analyzer must find complete scenes, a recorded viewport pause/resume, and zero rendered block intersections.

These are immutable negative/positive controls. Do not replace the raw time axis with a summary. New investigations create untracked files under `traces/`; promote only small, decision-bearing sessions here.
