# Heat and memory investigation — 2026-10-01

## Measurements and attribution

Ego Lite used an isolated space with the user's existing scripts, current
MWITools installation and already-running enhancement action. No production,
trades or resource-consuming actions were initiated. The first recording was
interrupted by another game window; it is excluded from steady-state conclusions.
After the user agreed to leave the other game window disconnected, both the
30-second initial recording and 20-second steady recording stayed connected.

The steady recording measured 3.806 seconds of main-thread task time in 20
seconds (roughly 19% of one main thread, **not** system CPU utilization), including
1.528 seconds of script time and 1.021 seconds of style recalculation. CPU samples
attributed approximately 650 ms to MWITools, 617 ms to the Reddit tracking script,
193 ms to Ranged Way Idle and 191 ms to Sunny's MWI. Attribution follows each
sample's nearest scripted ancestor, including native calls; it is approximate.
Unattributed browser work, GC, GPU work and physical temperature are not assigned
to any userscript by these figures.

The guild collector used about 1.19 seconds in the initial 30-second recording,
but only 7 ms in the steady recording. Its startup scan must not be described as
a continuously dominant cost. MWITools' identified paths included inventory
valuation/sorting, action-panel refresh, and duplicate-script detection. The
latter repeatedly ran broad DOM queries after page mutations despite having
no urgent gameplay work to perform.

JavaScript heap usage near startup was about 400.6 MB; after settling and GC it
was 143.5 MB, with a further 103.6 MB reported as embedder heap. Initial peak,
retained heap and whole-process resident memory are different quantities.
Previous heap inspection already established that shared-history records,
serialized snapshots, key indexes and rate curves retain multiple representations
of XP data. A disconnected game page also keeps much of its script/runtime state
until closed; additional open game pages can therefore compound memory usage.

## Changes

- Duplicate-script detection coalesces page changes into a scan after one
  second, instead of scanning once per mutation microtask. The initial scan,
  periodic fallback and setting-triggered updates remain; cleanup cancels the
  pending timeout.
- Shared storage indexes record keys by logical store, so a cold member-history
  read no longer filters every key in the manager. Persistent record format,
  merge baselines, deletion markers, migration and backup data are unchanged.
- Guild rolling-rate calculation advances two window pointers instead of
  rescanning preceding samples for every point. Gaps, coverage thresholds,
  duplicate timestamps and XP decreases retain their previous meaning.
- Member/leaderboard rate caches keep calculated values without unused curve
  points. Guild overview still retains the curve it displays. Character-scope
  cleanup clears rates and invalidates unfinished refreshes/sampling batches.

## Focused validation

All benchmark data below is synthetic, not a claim about whole-page acceleration:

- 100 stores / 80,000 XP records, identical read results: initial reads fell from
  about 1,860 ms to 142 ms in the local Node fixture.
- 30,000 dense XP samples: curve calculation fell from about 488 ms to 6 ms,
  with 15,000 output points in both cases. Threshold/gap/duplicate/decrease
  correctness is additionally checked by a reference calculation in unit tests.
- Repeated mutation scheduling makes one pending delayed scan, and disabling
  the monitor cancels it. Member/leaderboard rate values remain while their
  unused points are released and source history is unchanged.
- Existing cross-site merge, deletion, test-server isolation and backup rollback
  regressions pass with the new index.

The patch reduces specific unnecessary work; it does not remove the persistent
shared-history snapshot cache, disable other scripts, or promise a particular
temperature reduction. Long-duration growth, GPU utilization, battery power and
physical temperature were not measured. Raw profiles and script backups remain
local and are not committed.

## Installed-build check

The generated script was saved through Tampermonkey's editor, then the editor
was reloaded and its entire source matched the build. A fresh game load stayed
connected through a 15-second warm-up and 20-second recording.

In that recording, duplicate detection samples fell from about 88 ms to 26 ms,
and total samples attributed to MWITools fell from about 650 ms to 569 ms. These
are short sequential observations of a live game, not a randomized benchmark.
Total main-thread task duration was 3.894 seconds versus 3.806 seconds before;
there was **no clear whole-page CPU reduction** in this sample. Post-GC JS heap
was 141.2 MB versus 143.5 MB before, with embedder heap roughly unchanged at
103.5 MB. No temperature improvement is claimed from these measurements.

Read-only inspection of the installed page's rate cache found 132 entries,
zero member/leaderboard curve points, and 434 guild overview points. This
confirms the live cache keeps the displayed curve and releases unused ones.
