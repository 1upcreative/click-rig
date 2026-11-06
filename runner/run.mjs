// One exam: tracks in a real browser, every step through the same checks, a PASS or FAIL list, and an exit code.
// Your project hands in everything that's about your product: see README.md.
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { chromium } from "playwright-core";
import { Report } from "./report.mjs";
import { walker } from "./walk.mjs";

/** What a ship script reads. */
export const EXIT = { clean: 0, fail: 1, money: 2, noVerdict: 3 };

/** The flags every project's run script takes. What's left in `tracks` is the tracks asked for. */
export function parseArgs(argv) {
  const rest = [...argv];
  const value = (flag) => { const i = rest.indexOf(flag); return i >= 0 ? rest.splice(i, 2)[1] : undefined; };
  const flag = (name) => { const i = rest.indexOf(name); if (i >= 0) rest.splice(i, 1); return i >= 0; };
  return { tip: value("--tip"), tree: value("--tree"), exam: value("--exam") ?? "full", maxMin: Number(value("--max-min") ?? 0), size: value("--size"), noSeed: flag("--no-seed"), stop: flag("--stop"), tracks: rest };
}

/** Runs one exam and returns its exit code. config is yours; args come from parseArgs. */
export async function runExam(config, args) {
  const { tracks: TRACKS, exams, outDir, knownFile, lockName, labels, settings } = config;
  const exam = args.exam;
  if (!exams[exam]) { console.error(`No exam called ${exam}. Exams: ${Object.keys(exams).join(", ")}`); return EXIT.noVerdict; }
  const picked = args.tracks.length ? args.tracks : Object.keys(TRACKS);
  for (const t of picked) if (!TRACKS[t]) { console.error(`No track called ${t}. Tracks: ${Object.keys(TRACKS).join(", ")}`); return EXIT.noVerdict; }
  const sizes = args.size ? [args.size] : exams[exam].sizes;
  const keep = (walk) => !exams[exam].walks || exams[exam].walks.some((re) => re.test(walk));
  const skipSweeps = Boolean(exams[exam].walks);

  const started = Date.now();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dir = join(outDir, stamp);

  // one run per bench, whoever started it
  const lock = join(homedir(), `.claude/clickrig/lock-${lockName}.pid`);
  if (existsSync(lock)) {
    const pid = Number(readFileSync(lock, "utf8"));
    let alive = false;
    try { process.kill(pid, 0); alive = true; } catch { /* a run that died */ }
    if (alive) { console.error(`Another run (pid ${pid}) is using ${lockName}.`); return EXIT.noVerdict; }
  }
  mkdirSync(dirname(lock), { recursive: true });
  writeFileSync(lock, String(process.pid));
  if (args.maxMin) setTimeout(() => { console.error(`Gave up after ${args.maxMin} minutes.`); config.stop?.(); process.exit(EXIT.noVerdict); }, args.maxMin * 60_000).unref();

  console.log(`click rig · ${exam} exam · ${config.describe ?? ""} · tracks: ${picked.join(", ")} · sizes: ${sizes.join(", ")}`);
  // yours: bring the bench up, seed it, and say what the tracks need (a base address, logins). endRun runs when the browser closes.
  const { commit, endRun, ...extras } = await config.prepare(args);
  const report = new Report(dir, Report.loadKnown(knownFile), { tracks: picked, sizes, commit, exam, labels, ...config.reportMeta });
  const browser = await chromium.launch({ channel: "chrome", headless: true, executablePath: process.env.CHROME_BIN || undefined });

  // Track and size jobs share the bench, so a few run at once. What changes shared data takes turns (oneAtATime).
  const memory = {}; // what one job leaves for the next (saved sign-ins)
  const turns = new Map();
  const oneAtATime = (key, fn) => { const next = (turns.get(key) ?? Promise.resolve()).then(fn, fn); turns.set(key, next.catch(() => {})); return next; };
  const jobs = picked.flatMap((track) => sizes.map((viewport) => ({ track, viewport })));
  const workers = Number(process.env.CLICKRIG_JOBS ?? config.workers ?? 4);
  await Promise.all(Array.from({ length: workers }, async () => {
    for (let job = jobs.shift(); job; job = jobs.shift()) {
      const { track, viewport } = job;
      console.log(`  ${track} · ${viewport}`);
      const { run } = await TRACKS[track]();
      await run({ browser, report, track, viewport, memory, oneAtATime, exam, skipSweeps, settings, ...extras, walk: walker({ report, track, viewport, keep }) });
      console.log(`  ${track} · ${viewport} done (${((Date.now() - started) / 60000).toFixed(1)} min)`);
    }
  }));
  await browser.close();
  await endRun?.();
  if (args.stop) config.stop?.();

  const summary = report.write({ when: new Date().toLocaleString("en-US"), commit, exam, minutes: ((Date.now() - started) / 60000).toFixed(1), tracks: picked, sizes, everySize: sizes.length === exams[exam].sizes.length, ...config.reportMeta });
  console.log(`\n${summary.pass ? "PASS" : "FAIL"}: ${summary.passes} passed, ${summary.fails} failed, ${summary.skips} skipped · ${summary.grades}`);
  console.log(`list: ${join(dir, "report.md")}\nshots: ${join(dir, "index.html")}`);
  const code = summary.money ? EXIT.money : summary.noVerdict ? EXIT.noVerdict : summary.pass ? EXIT.clean : EXIT.fail;
  console.log(`exit ${code}: ${["clean", "a new fail", "STOP: money", "no verdict"][code]}`);
  rmSync(lock, { force: true });
  return code;
}

