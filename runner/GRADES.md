# How the runner grades

Each track gets one letter per run, from every step at every screen size. `grades.mjs` is the code for this page: change them together.

A step passes when a fake person could do it and its screen had no new problems. A skipped step isn't counted either way.

## Automatic F

- A money check failed. You mark those steps with `money: true`.
- A known issue marked `"money": true` is still open. Listing a money bug doesn't excuse it.
- Fewer than 60% of the steps passed.

## With no failed steps

| Grade | Earned by |
|---|---|
| A+ | Every step passed, no known issues |
| A | Every step passed, 1 or 2 known issues open |
| A- | Every step passed, 3 or more known issues open |

## With failed steps

| Grade | Share of steps passed |
|---|---|
| B+ | 97% or more |
| B | 94% to 96.9% |
| B- | 90% to 93.9% |
| C+ | 87% to 89.9% |
| C | 83% to 86.9% |
| C- | 80% to 82.9% |
| D+ | 77% to 79.9% |
| D | 70% to 76.9% |
| D- | 60% to 69.9% |

## No grade

If your server stops answering, those steps read SKIP and the track gets a `?`. A sick server says nothing about your screens.

## The cap

A money check that couldn't finish proves nothing. That track can't score above a C until a run finishes it.
