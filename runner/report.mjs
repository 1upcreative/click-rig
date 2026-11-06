// Collects every step and screen, then writes the PASS or FAIL list with screenshots.
// A finding on the known list prints as KNOWN, so a green run means nothing new, and the list stays in plain sight.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { gradeTrack } from "./grades.mjs";
import { VIEWPORTS } from "./humie.mjs";

const LIVE = process.env.CLICKRIG_LIVE ?? join(homedir(), ".claude/clickrig/live.json");
const TOTALS = join(dirname(LIVE), "totals.json"); // step counts for the progress bar, per exam

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export class Report {
  constructor(dir, known, run = {}) {
    this.dir = dir;
    this.known = known;
    this.rows = [];
    this.n = 0;
    this.run = { state: "running", startedAt: new Date().toISOString(), ...run };
    this.doing = {};
    try { this.totals = JSON.parse(readFileSync(TOTALS, "utf8"))[run.exam ?? "full"] ?? {}; } catch { this.totals = {}; }
    mkdirSync(join(dir, "shots"), { recursive: true });
    this.live();
  }

  /** The one file the sidebar reads. Written whole, then swapped in, so a reader never sees half of it. */
  live() {
    const tracks = {};
    for (const track of this.run.tracks ?? []) {
      const rows = this.rows.filter((r) => r.track === track);
      const issue = (r) => r.issues.filter((i) => !i.known);
      tracks[track] = {
        name: this.run.labels?.[track] ?? track,
        done: rows.length,
        total: this.totals[track] ?? null,
        passes: rows.filter((r) => r.status === "PASS").length,
        fails: rows.filter((r) => r.status === "FAIL").length,
        skips: rows.filter((r) => r.status === "SKIP").length,
        now: this.doing[track] ?? null,
        ...gradeTrack(rows, this.known),
        problems: rows.filter((r) => r.status !== "PASS").slice(-40).map((r) => ({ status: r.status, money: Boolean(r.money), size: r.viewport, step: r.step, detail: issue(r).map((i) => i.detail).join(" · ").slice(0, 200) })),
        known: [...new Set(rows.flatMap((r) => r.issues.filter((i) => i.known).map((i) => i.known)))],
        lastPasses: rows.filter((r) => r.status === "PASS").slice(-6).map((r) => ({ size: r.viewport, step: r.step })),
      };
    }
    try {
      mkdirSync(dirname(LIVE), { recursive: true });
      writeFileSync(`${LIVE}.tmp`, JSON.stringify({ ...this.run, updatedAt: new Date().toISOString(), reportDir: this.dir, tracks }, null, 1));
      renameSync(`${LIVE}.tmp`, LIVE);
    } catch { /* the sidebar is a nicety: it never stops a run */ }
  }

  now({ track, viewport, step }) { this.doing[track] = { size: viewport, step }; this.live(); }

  knownIssue(f, ctx) {
    return this.known.find((k) => k.check === f.check && new RegExp(k.match, "i").test(f.detail) && (!k.screen || new RegExp(k.screen, "i").test(ctx.screen)) && (!k.viewport || k.viewport === ctx.viewport));
  }

  async shoot(page, ctx) {
    this.n += 1;
    const file = `shots/${String(this.n).padStart(3, "0")}-${ctx.track}-${ctx.viewport}-${slug(ctx.screen)}.png`;
    await page.screenshot({ path: join(this.dir, file), timeout: 15_000 }).catch(() => {});
    return file;
  }

  /** One screen's findings. Throws nothing: a bad screen is a FAIL row, and the walk goes on. */
  async screen({ track, viewport, who, screen, url, page, found, shot, money }) {
    const ctx = { track, viewport, screen };
    const issues = found.map((f) => { const k = this.knownIssue(f, ctx); return { ...f, known: k?.id ?? null }; });
    const fails = issues.filter((f) => !f.known);
    const file = shot || fails.length ? await this.shoot(page, ctx) : null;
    this.rows.push({ track, viewport, who, step: screen, status: fails.length ? "FAIL" : "PASS", money, url: url.replace(/\?t=.*/, "?t=…"), issues, shot: file });
    this.live();
    return fails.length === 0;
  }

  async stepFailed({ track, viewport, who, screen, page, error, money = false }) {
    const file = page ? await this.shoot(page, { track, viewport, screen }) : null;
    this.rows.push({ track, viewport, who, step: screen, status: "FAIL", money, url: page?.url?.() ?? "", issues: [{ check: "step", detail: String(error?.message ?? error).split("\n")[0].slice(0, 300) }], shot: file });
    this.live();
  }

  skipped({ track, viewport, who, screen, why, money = false }) {
    this.rows.push({ track, viewport, who, step: screen, status: "SKIP", money, url: "", issues: [{ check: "skipped", detail: why }], shot: null });
    this.live();
  }

  write(meta) {
    const order = Object.keys(VIEWPORTS);
    const rows = [...this.rows].sort((a, b) => a.track.localeCompare(b.track) || order.indexOf(a.viewport) - order.indexOf(b.viewport));
    const count = (s, list = rows) => list.filter((r) => r.status === s).length;
    const tracks = [...new Set(rows.map((r) => r.track))];
    const known = new Map();
    for (const r of rows) for (const i of r.issues) if (i.known) known.set(i.known, (known.get(i.known) ?? 0) + 1);
    const pass = count("FAIL") === 0;
    const lines = [`# Click rig: ${pass ? "PASS" : "FAIL"}`, "", `${meta.when} · ${meta.commit} · ${meta.minutes} min · ${count("PASS")} passed, ${count("FAIL")} failed, ${count("SKIP")} skipped`, ""];
    for (const t of tracks) {
      const list = rows.filter((r) => r.track === t);
      const mark = gradeTrack(list, this.known);
      lines.push(`## ${t}: ${count("FAIL", list) ? "FAIL" : "PASS"}, grade ${mark.grade} (${count("PASS", list)} of ${list.length})`, "", mark.why, "", "| | Screen size | Who | Step | What went wrong | Shot |", "|---|---|---|---|---|---|");
      for (const r of list) {
        const bad = r.issues.filter((i) => !i.known).map((i) => `${i.check}: ${i.detail}`).join("<br>").replace(/\|/g, "\\|");
        lines.push(`| ${r.status} | ${r.viewport} | ${r.who} | ${r.step} | ${bad} | ${r.shot ? `[shot](${r.shot})` : ""} |`);
      }
      lines.push("");
    }
    if (known.size) {
      lines.push("## Known issues (not failing the run)", "");
      for (const [id, n] of known) { const k = this.known.find((x) => x.id === id); lines.push(`- **${id}** (${n} rows): ${k.note}`); }
      lines.push("");
    }
    writeFileSync(join(this.dir, "report.md"), `${lines.join("\n")}\n`);
    this.run = { ...this.run, state: "done", finishedAt: new Date().toISOString(), pass };
    this.doing = {};
    this.live();
    if (meta.everySize) { // a run at every size sets the progress bar's length
      const totals = Object.fromEntries(tracks.map((t) => [t, rows.filter((r) => r.track === t).length]));
      let all = {};
      try { all = JSON.parse(readFileSync(TOTALS, "utf8")); } catch { /* first run */ }
      try { writeFileSync(TOTALS, JSON.stringify({ ...all, [meta.exam ?? "full"]: { ...this.totals, ...totals } })); } catch { /* the sidebar shows a count instead */ }
    }
    writeFileSync(join(this.dir, "results.json"), JSON.stringify({ meta, rows }, null, 2));
    const cards = rows.filter((r) => r.shot).map((r) => `<figure class="${r.status}"><a href="${r.shot}"><img loading="lazy" src="${r.shot}" alt=""></a><figcaption><b>${r.status}</b> ${esc(r.track)} · ${esc(r.viewport)} · ${esc(r.step)}${r.issues.filter((i) => !i.known).map((i) => `<br><small>${esc(i.check)}: ${esc(i.detail)}</small>`).join("")}</figcaption></figure>`);
    writeFileSync(join(this.dir, "index.html"), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Click rig ${pass ? "PASS" : "FAIL"}</title><style>body{font:15px system-ui;margin:16px;background:#f6f8f8;color:#123}h1{margin:0 0 4px}section{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-top:16px}figure{margin:0;background:#fff;border:2px solid #cfdcdc;border-radius:8px;overflow:hidden}figure.FAIL{border-color:#b3261e}img{width:100%;display:block;max-height:220px;object-fit:cover;object-position:top}figcaption{padding:8px}small{color:#7a1c16}</style><h1>Click rig: ${pass ? "PASS" : "FAIL"}</h1><p>${esc(meta.when)} · ${esc(meta.commit)} · ${count("PASS")} passed, ${count("FAIL")} failed, ${count("SKIP")} skipped</p><section>${cards.sort((a, b) => (a.includes('class="FAIL"') ? -1 : 0) - (b.includes('class="FAIL"') ? -1 : 0)).join("")}</section>`);
    const marks = tracks.map((t) => [t, gradeTrack(rows.filter((r) => r.track === t), this.known)]);
    return {
      pass, fails: count("FAIL"), passes: count("PASS"), skips: count("SKIP"),
      grades: marks.map(([t, m]) => `${t} ${m.grade}`).join(", "),
      money: marks.some(([, m]) => m.grade === "F" && /money/i.test(m.why)),
      noVerdict: marks.some(([, m]) => m.grade === "?"),
    };
  }

  static loadKnown(path) {
    try { return JSON.parse(readFileSync(path, "utf8")); } catch { return []; }
  }
}
