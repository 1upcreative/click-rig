// The checks every screen gets, after every step. Each one is the shape of a bug a person caught by hand.
// Nothing here knows your product: words to watch for come in through settings.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

/** Runs in the page: sideways scroll, controls off the side, switches that are on but look off, words. */
export function pageScan({ oldNames, leaks, errorWords, screenWidth }) {
  // the size we asked for, not what the browser reports: a phone browser zooms out to fit a page that's too wide
  const width = Math.min(screenWidth, document.documentElement.clientWidth);
  const out = [];
  const seen = (el) => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05 && r.width > 0 && r.height > 0; };
  const nameOf = (el) => (el.getAttribute("aria-label") || el.closest("label")?.textContent || el.textContent || el.getAttribute("name") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 50);
  const scrollsSideways = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const x = getComputedStyle(p).overflowX; if ((x === "auto" || x === "scroll" || x === "hidden" || x === "clip") && p.getBoundingClientRect().width <= width + 1) return true; } return false; };

  // 1 · no sideways scroll, ever
  const over = document.documentElement.scrollWidth - width;
  if (over > 1) {
    const wide = [...document.body.querySelectorAll("*")].filter((el) => seen(el) && el.getBoundingClientRect().right > width + 1 && !scrollsSideways(el)).slice(-3).map((el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? `.${el.className.trim().split(/\s+/)[0]}` : ""}`);
    out.push({ check: "sideways-scroll", detail: `page is ${over}px wider than the screen (${wide.join(", ") || "element not found"})` });
  }

  // 2 · a control you can't reach: the switch off the edge at 320
  const controls = [...document.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea, [role="switch"], [role="button"]')];
  for (const el of controls) {
    if (!seen(el) || scrollsSideways(el) || el.closest('[aria-hidden="true"]')) continue;
    const r = el.getBoundingClientRect();
    if (r.right > width + 1 || r.left < -1) { out.push({ check: "control-offscreen", detail: `"${nameOf(el)}" runs off the screen (left ${Math.round(r.left)}, right ${Math.round(r.right)} of ${width})` }); }
  }

  // 2b · a button in an open box that something else sits on top of: the close button under the top bar at 320
  for (const el of document.querySelectorAll('[role="dialog"] button, [aria-modal="true"] button, .modal button')) {
    if (!seen(el)) continue;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2; const y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > width || y > window.innerHeight) continue;
    const holder = el.closest('[role="dialog"], [aria-modal="true"], .modal');
    const box = holder.getBoundingClientRect();
    if (y < box.top || y > box.bottom) continue; // scrolled out of the box, not covered
    const hit = document.elementFromPoint(x, y);
    if (hit && !el.contains(hit) && !holder.contains(hit)) out.push({ check: "control-covered", detail: `"${nameOf(el)}" sits under ${hit.tagName.toLowerCase()}${typeof hit.className === "string" && hit.className ? `.${hit.className.trim().split(/\s+/)[0]}` : ""}` });
  }

  // 3 · a switch that is on must not look off: gray with no color reads as off
  const visual = (el) => (el.tagName === "INPUT" ? el.closest("label") ?? el : el);
  const on = [...document.querySelectorAll('[role="switch"][aria-checked="true"], input[role="switch"]:checked')].filter((el) => seen(visual(el)));
  const colorOf = (el) => {
    const box = visual(el);
    for (const node of [box.querySelector(".switch__track"), box, ...box.querySelectorAll("*")].filter(Boolean)) {
      for (const pseudo of [null, "::before"]) {
        const m = getComputedStyle(node, pseudo).backgroundColor.match(/[\d.]+/g);
        if (m && (m.length < 4 || Number(m[3]) > 0.3) && m.length >= 3) { const [r, g, b] = m.map(Number); if (Math.max(r, g, b) < 245 || Math.min(r, g, b) < 235) return { r, g, b }; }
      }
    }
    return null;
  };
  for (const el of on) {
    const c = colorOf(el);
    if (c && Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) < 18 && Math.max(c.r, c.g, c.b) > 90) out.push({ check: "switch-looks-off", detail: `"${nameOf(el)}" is on but its color is gray (rgb ${c.r} ${c.g} ${c.b})` });
  }

  // 4 · words on screen
  const text = document.body.innerText || "";
  for (const { re, was } of oldNames) { const m = text.match(new RegExp(re[0], re[1])); if (m) out.push({ check: "old-name", detail: `"${m[0]}" on screen: ${was}` }); }
  for (const { re, was } of leaks) { const m = text.match(new RegExp(re[0], re[1])); if (m) out.push({ check: "brand-leak", detail: `"${m[0]}" on screen: ${was}` }); }
  if (new RegExp(errorWords[0], errorWords[1]).test(text)) out.push({ check: "error-screen", detail: "the page shows an error message" });
  return out;
}

const asPair = (re) => [re.source, re.flags];
const ERROR_WORDS = /Application error|Unhandled Runtime Error|Something went wrong/i;

/** settings.oldNames and settings.leaks: [{ re, was }], words that must not show on screen. A step can turn leaks off. */
export const scanArgs = (screenOpts = {}, screenWidth = 99999, settings = {}) => ({
  screenWidth,
  oldNames: (settings.oldNames ?? []).map(({ re, was }) => ({ re: asPair(re), was })),
  leaks: screenOpts.leaks === false ? [] : (settings.leaks ?? []).map(({ re, was }) => ({ re: asPair(re), was })),
  errorWords: asPair(settings.errorWords ?? ERROR_WORDS),
});

/** Contrast and names a screen reader needs, from axe. Tools catch about a third: the rig is a floor, not a WCAG sign-off. */
export async function axeScan(page) {
  await page.evaluate(AXE);
  const found = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: ["color-contrast", "button-name", "link-name", "label", "select-name", "aria-toggle-field-name"], resultTypes: ["violations"] });
    return r.violations.flatMap((v) => v.nodes.slice(0, 6).map((n) => ({ rule: v.id, target: String(n.target[0]).slice(0, 90), text: (n.any[0]?.message ?? n.failureSummary ?? "").slice(0, 150) })));
  });
  return found.map((f) => ({ check: f.rule === "color-contrast" ? "contrast" : `a11y-${f.rule}`, detail: `${f.target}: ${f.text}` }));
}

const CONSOLE_NOISE = [/Download the React DevTools/, /\[HMR\]/, /\[Fast Refresh\]/, /favicon/, /net::ERR_FAILED/, /net::ERR_BLOCKED/, /net::ERR_ABORTED/, /status of 40[13]/, /status of 4(09|22|29)/, /webpack-hmr/, /_next\/webpack-hmr/];
export const isNoise = (text, extra = []) => [...CONSOLE_NOISE, ...extra].some((re) => re.test(text));
