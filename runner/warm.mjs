// A dev server compiles each page and API route the first time it's asked, which can take longer than a person waits.
// So every run remembers what it touched, and the next fresh server gets asked for all of it first, by plain request.
// The list keeps itself current. A seed file in your repo is the starter for a first run on a new computer.
import http from "node:http";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const touched = new Set();
const TOKENS = /[?#].*$/;

/** Called for every response: keeps pages and our own APIs, skips assets and anything off this computer. */
export function remember(url, kind) {
  const u = new URL(url);
  if (!/localhost$/.test(u.hostname) || !["document", "fetch", "xhr"].includes(kind)) return;
  if (/\/_next\//.test(u.pathname)) return;
  touched.add(`${u.host}${u.pathname}`.replace(TOKENS, ""));
}

/** seedFile: the starter list in your repo. runDir: this run's working folder. port: where to ask. secret: paths never written down, such as links that carry a token.
 *  readyFile: a file that's newer than the last warm-up when the server restarted. */
export function createWarm({ seedFile, runDir, port, secret = /$^/, readyFile }) {
  const learned = join(runDir, "warm-list.json");
  const stamp = join(runDir, "warm.stamp");
  const swap = (e) => e.replace(/^([^/]*localhost):\d+/, `$1:${port}`); // the list may come from a run on other ports
  const list = () => [...new Set([learned, seedFile].filter((f) => f && existsSync(f)).flatMap((f) => JSON.parse(readFileSync(f, "utf8"))))].filter((e) => !secret.test(e)).map(swap);

  function ask(entry) {
    const cut = entry.indexOf("/");
    const [host, path] = [entry.slice(0, cut), entry.slice(cut)];
    return new Promise((done) => {
      const req = http.request({ host: "127.0.0.1", port, path, headers: { host } }, (res) => { res.resume(); res.on("end", done); });
      req.setTimeout(180_000, () => { req.destroy(); done(); });
      req.on("error", done);
      req.end();
    });
  }

  return {
    save() {
      const known = existsSync(learned) ? JSON.parse(readFileSync(learned, "utf8")) : [];
      writeFileSync(learned, JSON.stringify([...new Set([...known, ...touched])].filter((e) => !secret.test(e)).sort(), null, 1));
    },
    /** Skipped when this server has been warmed already. */
    async warmUp() {
      if (existsSync(stamp) && readyFile && existsSync(readyFile) && statSync(stamp).mtimeMs > statSync(readyFile).mtimeMs) return;
      const queue = list();
      console.log(`warming ${queue.length} pages and routes`);
      await Promise.all(Array.from({ length: 3 }, async () => { for (let e = queue.shift(); e; e = queue.shift()) await ask(e); }));
      writeFileSync(stamp, new Date().toISOString());
    },
    /** A dev server drops a route it hasn't heard from in a minute, and rebuilding one under a live page resets that page.
     *  So while a run goes, the API routes get a knock every 30 seconds. A knock changes nothing: it's a GET with no sign-in. */
    keepWarm() {
      const apis = list().filter((e) => /\/api\//.test(e));
      const beat = setInterval(async () => { for (const e of apis) await ask(e); }, 30_000);
      beat.unref();
      return () => clearInterval(beat);
    },
  };
}
