// node --test runner/tip.test.mjs
// Proves prepareTip moves a generated file aside when the tip starts tracking it,
// and only reinstalls packages when the lockfile really changed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareTip } from "./tip.mjs";

const sh = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const quiet = async (fn) => { const log = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = log; } };

function project() {
  const root = mkdtempSync(join(tmpdir(), "tip-"));
  const origin = join(root, "origin.git"), repo = join(root, "repo"), tree = join(root, "exam");
  sh(root, "init", "-q", "--bare", origin);
  sh(root, "clone", "-q", origin, repo);
  for (const [k, v] of [["user.email", "rig@example.com"], ["user.name", "rig"]]) sh(repo, "config", k, v);
  const pkg = { name: "fixture", version: "1.0.0", private: true };
  writeFileSync(join(repo, "package.json"), JSON.stringify(pkg));
  writeFileSync(join(repo, "package-lock.json"), JSON.stringify({ name: "fixture", version: "1.0.0", lockfileVersion: 3, requires: true, packages: { "": pkg } }));
  sh(repo, "add", "."); sh(repo, "commit", "-qm", "one"); sh(repo, "push", "-q", "origin", "HEAD");
  mkdirSync(join(repo, "node_modules"));
  const commit = (msg, files) => {
    for (const [f, body] of Object.entries(files)) writeFileSync(join(repo, f), body);
    sh(repo, "add", "."); sh(repo, "commit", "-qm", msg); sh(repo, "push", "-q", "origin", "HEAD");
    return sh(repo, "rev-parse", "HEAD");
  };
  return { repo, tree, commit, first: sh(repo, "rev-parse", "HEAD") };
}

test("a generated file the tip starts tracking is moved aside, not deleted", async () => {
  const p = project();
  await quiet(() => prepareTip(p.first, { repo: p.repo, tree: p.tree }));
  writeFileSync(join(p.tree, "AGENTS.md"), "written by a dev server\n");
  const next = p.commit("track it", { "AGENTS.md": "tracked\n" });
  await quiet(() => prepareTip(next, { repo: p.repo, tree: p.tree }));
  assert.equal(sh(p.tree, "rev-parse", "HEAD"), next);
  assert.equal(readFileSync(join(p.tree, "AGENTS.md"), "utf8"), "tracked\n");
  const aside = execFileSync("find", [join(p.tree, ".rig-aside"), "-name", "AGENTS.md"], { encoding: "utf8" }).trim();
  assert.equal(readFileSync(aside, "utf8"), "written by a dev server\n");
});

test("packages reinstall only when the lockfile changes, after beforeInstall", async () => {
  const p = project();
  let calls = 0;
  const opts = { repo: p.repo, tree: p.tree, beforeInstall: () => { calls++; } };
  await quiet(() => prepareTip(p.first, opts));
  assert.equal(calls, 0, "same lockfile as the repo: cloned, no install");
  const code = p.commit("code only", { "a.js": "1\n" });
  await quiet(() => prepareTip(code, opts));
  assert.equal(calls, 0, "a tip that keeps the lockfile never reinstalls");
  const lock = JSON.parse(readFileSync(join(p.repo, "package-lock.json"), "utf8"));
  lock.packages[""].description = "moved";
  const moved = p.commit("lock moved", { "package-lock.json": JSON.stringify(lock) });
  await quiet(() => prepareTip(moved, opts));
  assert.equal(calls, 1, "a new lockfile installs, after beforeInstall");
  assert.ok(existsSync(join(p.tree, "node_modules", ".rig-lock")));
  await quiet(() => prepareTip(moved, opts));
  assert.equal(calls, 1, "the same tip again doesn't reinstall");
});
