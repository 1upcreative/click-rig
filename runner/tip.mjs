// Puts a commit in a checkout of its own, so the rig tests what's shipping and the working tree stays put.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const lines = (text) => text.split("\n").filter(Boolean);
const lockOf = (cwd, rev) => { try { return git(cwd, "rev-parse", `${rev}:package-lock.json`); } catch { return ""; } };

/**
 * What git would refuse to check out over, such as files a dev server wrote: untracked files the tip adds,
 * and local edits to files the tip changes.
 */
function clashes(tree, sha) {
  const added = lines(git(tree, "diff", "--name-only", "--diff-filter=A", "HEAD", sha)).filter((file) => existsSync(join(tree, file)));
  const changed = new Set(lines(git(tree, "diff", "--name-only", "HEAD", sha)));
  const edited = lines(git(tree, "diff", "--name-only", "HEAD")).filter((file) => changed.has(file) && existsSync(join(tree, file)));
  return { added, edited };
}

/** Keeps a copy of each clashing file under .rig-aside/<time>/ in the checkout, never deletes one. */
function moveAside(tree, { added, edited }) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const keep = (file) => {
    const to = join(tree, ".rig-aside", stamp, file);
    mkdirSync(dirname(to), { recursive: true });
    return to;
  };
  for (const file of added) {
    renameSync(join(tree, file), keep(file));
    console.log(`moved aside ${file}: the tip tracks it (in ${join(".rig-aside", stamp)})`);
  }
  for (const file of edited) {
    copyFileSync(join(tree, file), keep(file));
    git(tree, "checkout", "-q", "HEAD", "--", file);
    console.log(`set aside a local edit to ${file}: the tip changes it (in ${join(".rig-aside", stamp)})`);
  }
}

/**
 * repo: your checkout. tree: where the tip goes. localFiles: files git doesn't carry, copied over once.
 * modules: folders of installed packages. beforeInstall: a plain function called before packages change
 * under the tree, so you can stop servers that watch it. It must finish its work before it returns.
 */
export function prepareTip(ref, { repo, tree, localFiles = [], modules = ["node_modules"], beforeInstall }) {
  git(repo, "fetch", "-q", "origin");
  const sha = git(repo, "rev-parse", "--verify", `${ref}^{commit}`);
  const fresh = !existsSync(join(tree, ".git"));
  // the lockfile the installed packages came from: the stamp an install left, or the checkout's last commit
  const stampFile = join(tree, modules[0], ".rig-lock");
  let installed = "";
  if (fresh) git(repo, "worktree", "add", "--detach", tree, sha);
  else {
    installed = existsSync(stampFile) ? readFileSync(stampFile, "utf8").trim() : lockOf(tree, "HEAD");
    const blocked = clashes(tree, sha);
    if (blocked.added.length || blocked.edited.length) moveAside(tree, blocked);
    git(tree, "checkout", "-q", "--detach", sha);
  }
  for (const file of localFiles) if (!existsSync(join(tree, file))) copyFileSync(join(repo, file), join(tree, file));

  const wanted = lockOf(tree, "HEAD");
  const missing = !existsSync(join(tree, modules[0]));
  if (missing && lockOf(repo, "HEAD") === wanted) {
    // same lockfile as your checkout: a clone of its packages is instant
    for (const m of modules) execFileSync("cp", ["-cR", join(repo, m), join(tree, m)]);
  } else if (missing || installed !== wanted) {
    if (beforeInstall) beforeInstall();
    execFileSync("npm", ["ci", "--no-audit", "--no-fund"], { cwd: tree, stdio: "ignore" });
    console.log(`installed packages for ${wanted.slice(0, 8)}`);
  }
  if (existsSync(join(tree, modules[0]))) writeFileSync(stampFile, `${wanted}\n`);
  console.log(`testing ${ref} at ${sha.slice(0, 8)} in ${tree}`);
  return tree;
}
