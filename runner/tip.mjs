// Puts a commit in a checkout of its own, so the rig tests what's shipping and the working tree stays put.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** repo: your checkout. tree: where the tip goes. localFiles: files git doesn't carry, copied over once. modules: folders of installed packages, cloned once. */
export function prepareTip(ref, { repo, tree, localFiles = [], modules = ["node_modules"] }) {
  git(repo, "fetch", "-q", "origin");
  const sha = git(repo, "rev-parse", "--verify", `${ref}^{commit}`);
  if (!existsSync(join(tree, ".git"))) git(repo, "worktree", "add", "--detach", tree, sha);
  else git(tree, "checkout", "-q", "--detach", sha);
  for (const file of localFiles) if (!existsSync(join(tree, file))) copyFileSync(join(repo, file), join(tree, file));
  // same lockfile: a clone of this checkout's packages is instant. A new lockfile gets a real install
  const lockMoved = git(repo, "rev-parse", "HEAD:package-lock.json") !== git(tree, "rev-parse", "HEAD:package-lock.json");
  const missing = !existsSync(join(tree, modules[0]));
  if (missing && !lockMoved) for (const m of modules) execFileSync("cp", ["-cR", join(repo, m), join(tree, m)]);
  else if (missing || lockMoved) execFileSync("npm", ["ci", "--no-audit", "--no-fund"], { cwd: tree, stdio: "ignore" });
  console.log(`testing ${ref} at ${sha.slice(0, 8)} in ${tree}`);
  return tree;
}
