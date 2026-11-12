# The runner

Fake people clicking real screens in a real browser. You write tracks the way a person would use your app, by the words on the screen. The runner drives the Chrome on your computer, puts every screen through the same checks, and writes a PASS or FAIL list with screenshots and a grade.

It only ever runs on your own computer: it refuses any address that isn't local, and the browser blocks requests that leave it.

## What every screen gets

After every step, at every size: no console errors, no page errors, no 500s, no sideways scroll, no control off the edge, no button covered inside an open box, no switch that's on but looks off, no words you've banned, and axe's contrast and naming rules. Axe catches about a third of accessibility problems, so this is a floor, not a sign-off.

Sizes are `desktop` (1440×900), `phone` (390×844), `small` (320×568) and `landscape` (844×390).

## Start

```bash
npm install github:1upcreative/click-rig
```

`node_modules/click-rig/runner/selftest.mjs` serves a page with every bug on it, and each check must catch its own. Run it first to see the rig work.

## A small example

Three files. This project is a shop running on `localhost:3000`.

`run.mjs` reads your flags and starts the exam:

```js
import { parseArgs, runExam } from "click-rig/runner";
import { config } from "./config.mjs";

process.exit(await runExam(config, parseArgs(process.argv.slice(2))));
```

`config.mjs` says what's yours:

```js
export const config = {
  tracks: { shopper: () => import("./tracks/shopper.mjs") },
  labels: { shopper: "Shopper" },
  exams: {
    full: { sizes: ["desktop", "phone", "small", "landscape"], walks: null },
    fast: { sizes: ["desktop", "small"], walks: [/^checkout$/] },
  },
  settings: {
    oldNames: [{ re: /Acme Classic/, was: "Acme Classic (now Acme)" }],
    leaks: [{ re: /lorem ipsum/i, was: "placeholder words" }],
    outsideHosts: [/(^|\.)stripe\.com$/], // reachable only during a payment step
    alivePath: "/",
  },
  outDir: new URL("./out", import.meta.url).pathname,
  knownFile: new URL("./known-issues.json", import.meta.url).pathname,
  lockName: "shop",
  // start your server and seed test data here. What you return reaches every track.
  async prepare() {
    return { commit: "dev", base: "http://localhost:3000" };
  },
};
```

`tracks/shopper.mjs` is what a person does:

```js
import { Humie } from "click-rig/runner";

export async function run({ browser, report, track, viewport, base, settings, walk }) {
  const h = await new Humie({ browser, report, track, viewport, who: "shopper", settings }).start();
  await walk(h, "checkout", async (step) => {
    await step("home page", async () => { await h.go(base); await h.see("Welcome"); });
    await step("add to cart", async () => { await h.press("Add to cart"); await h.see("In your cart"); });
    await step("pay", async () => { await h.press("Check out"); await h.see(/order \d+/i); }, { money: true });
  });
  await h.close();
}
```

Run it:

```bash
node run.mjs
```

```bash
node run.mjs --exam fast --size small
```

## Writing steps

A walk is ordered steps by one person. If a step can't be done, the rest of that walk stops and the next walk starts. Finding things by their words means a CSS rename never breaks a track. A changed button name does, and your docs likely need that same fix.

| On `h` | Does |
|---|---|
| `go(url)` | Opens a page on this computer |
| `press(name, role?)` | Clicks or taps a button, link, switch or tab by its words |
| `type(label, value)` | Fills a field by its label |
| `pick(words)` | Picks a card-style choice |
| `flip(locator)` | Flips a switch |
| `fold(name)` | Opens a fold-out by its heading |
| `see(text)` / `notSee(text)` | Waits for words, or refuses them |
| `seeControl(name)` | Waits for a control a person could press |
| `openMenuIfHidden(name)` | Opens the menu when a small screen hides a link |
| `flag(check, detail)` | Records a problem the step worked around |

`step(name, fn, opts)` takes `money: true`, `axe: false`, `shot: false` and `leaks: false`.

`sweep(h, walk, name, base, [[label, path], ...])` walks a list of screens by address. A page list as data is the cheapest coverage you can write.

Throw `Outside` from a step when another company's service didn't play along. The step reads SKIP with your reason, never PASS.

`oneAtATime(key, fn)`, handed to every track, makes walks that change shared data take turns.

## Exams

`exams` names your exams. `walks: null` runs everything. A list of patterns keeps only the walks it matches and skips sweeps, which is how one set of tracks gives you a fast check before a ship.

| Exit code | Means | A ship should |
|---|---|---|
| 0 | Clean | Go on |
| 1 | A new fail, no money | Stop and sort it |
| 2 | A failed money check, or an open money bug | Stop. Always |
| 3 | No verdict: the server went down, another run holds the lock, or time ran out | Run it again |

Flags: `--exam <name>`, `--size <size>`, `--tip <ref>` and `--tree <folder>` (your run script decides what those two do, with `prepareTip`), `--no-seed`, `--stop`, `--max-min <n>`.

`prepareTip(ref, { repo, tree, modules, beforeInstall })` puts a commit in a checkout of its own. It only installs packages when the lockfile changed, and calls `beforeInstall` first so you can stop servers watching that folder. Files a dev server left in the way are moved to `.rig-aside/`, never deleted.

## Known issues

`knownFile` lists real problems you've found and haven't fixed:

```json
[{ "id": "footer-contrast", "check": "contrast", "match": "\\.footer-link", "note": "Footer links are pale. Fix planned." }]
```

They print as KNOWN and don't fail the run, so green means nothing new. Add `"money": true` and the track stays an F until it's fixed.

## Dev servers

A dev server compiles each page the first time it's asked, slower than a person waits, and can reload the browser mid-step.

- `createWarm()` remembers what a run touched, asks for all of it before the next one, and keeps your API routes awake during a run.
- `settings.quietSockets` keeps a hot-reload socket shut, such as `/webpack-hmr/`.
- Run about 4 jobs at once (`CLICKRIG_JOBS`). More can swamp a dev server, and then every page times out.

## The sheet

The run writes `~/.claude/clickrig/live.json`, and the Click Rig mod in this repo draws it as an exam on notebook paper. `GRADES.md` says what earns each grade.
