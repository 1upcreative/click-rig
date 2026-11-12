# Changes

## 0.2.1

Fixes for testing a commit with `--tip`. Nothing you call changes.

- **A run no longer dies when a dev server left a file behind.** Dev servers write files into your project, such as notes or type files. If the commit you test starts tracking one of those files, or changes one the server edited, git refused to switch, and the run ended before it started. Now the rig moves those files out of the way. It never deletes them. You'll find them in `.rig-aside/<time>/` inside the test checkout.
- **Packages install only when your lockfile changed.** Before, every `--tip` run reinstalled them, which was slow. Worse, a dev server still running in that folder could break mid-install, so every page on it failed.
- **New option: `beforeInstall`.** `prepareTip` calls it right before packages change, so you can stop servers that watch the folder. It's a plain function, and it must finish before it returns.
- **New test:** `node --test runner/tip.test.mjs` checks all three.

## 0.2.0

The runner: fake people clicking real screens, graded like a paper exam.

## 0.1.0

The sheet: a paper exam beside the chat.
