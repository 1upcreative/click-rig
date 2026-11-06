#!/usr/bin/env node
// Proves the checks can see. A page with every bug the rig hunts is served on this computer, and each check must
// catch its own bug; a clean page must pass. A rig that can't fail is worse than no rig. Runs in about 5 seconds.
//   node runner/selftest.mjs
import http from "node:http";
import { chromium } from "playwright-core";
import { Humie } from "./humie.mjs";

const BAD = `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>bad</title><body style="margin:0;background:#fff">
<main>
  <h1>Bench</h1>
  <p style="color:#bbb;background:#fff">Pale words nobody can read</p>
  <div style="width:900px;height:20px;background:#eee">too wide</div>
  <button style="position:absolute;left:600px;top:60px">Way Off The Edge</button>
  <button role="switch" aria-checked="true" aria-label="Looks Off" style="width:38px;height:22px;background:#cbd1cc;border:0"></button>
  <button><svg width="16" height="16"></svg></button>
  <p>Acme Classic is an old name.</p>
  <p>Built by placeholder inc.</p>
  <div role="dialog" style="position:fixed;top:0;left:0;width:300px;height:80px;background:#fff"><button style="position:absolute;top:4px;left:4px">Close Me</button></div>
  <div style="position:fixed;top:0;left:0;width:300px;height:40px;background:#222"></div>
</main>
<script>console.error("something broke"); setTimeout(() => { throw new Error("page blew up"); }, 0);</script>`;
const GOOD = `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>good</title><body style="margin:0;background:#fff;color:#111"><main><h1>Bench</h1><p>All good here.</p><button>Press</button></main>`;
const WANTED = ["sideways-scroll", "control-offscreen", "switch-looks-off", "contrast", "a11y-button-name", "old-name", "brand-leak", "control-covered", "console-error", "page-error"];

const server = http.createServer((req, res) => { res.setHeader("content-type", "text/html"); res.end(req.url === "/good" ? GOOD : BAD); });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://localhost:${server.address().port}`;
const seen = [];
const report = { screen: async ({ found }) => { seen.push(found); return !found.length; } };
const browser = await chromium.launch({ channel: "chrome", headless: true, executablePath: process.env.CHROME_BIN || undefined });
const settings = { oldNames: [{ re: /Acme Classic/, was: "the old product name" }], leaks: [{ re: /placeholder inc/i, was: "a name that must not show" }] };
const h = await new Humie({ browser, report, track: "selftest", viewport: "phone", who: "nobody", settings }).start();

await h.go(`${base}/bad`);
await h.check("bad");
await h.go(`${base}/good`);
await h.check("good");
await browser.close();
server.close();

const caught = new Set(seen[0].map((f) => f.check));
const missed = WANTED.filter((c) => !caught.has(c));
const falseAlarms = seen[1];
for (const c of WANTED) console.log(`${caught.has(c) ? "caught" : "MISSED"}  ${c}`);
if (falseAlarms.length) console.log(`false alarms on the clean page: ${JSON.stringify(falseAlarms)}`);
const ok = !missed.length && !falseAlarms.length;
console.log(ok ? "PASS: every check catches its bug, and the clean page is clean." : "FAIL: the rig has a blind spot.");
process.exit(ok ? 0 : 1);
