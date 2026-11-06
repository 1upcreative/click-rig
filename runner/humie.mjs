// One fake person at one screen size, clicking the way a person does: by the words on the screen, with a real
// mouse (or finger) on the real spot. A control hidden under something else fails the click, same as for a person.
import { axeScan, isNoise, pageScan, scanArgs } from "./checks.mjs";
import { Outside } from "./walk.mjs";
import { remember } from "./warm.mjs";

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  small: { width: 320, height: 568, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  landscape: { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
const STEP_MS = Number(process.env.CLICKRIG_STEP_MS ?? 25_000); // long enough for a busy dev server, not a test of speed
const PAGE_MS = 60_000; // dev servers compile a page the first time it's asked for
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\]|[a-z0-9-]+\.localhost)$/i;

/** Throws unless url is on this computer. The rig never runs against a server. */
export function assertLocalUrl(url) {
  const host = new URL(url).hostname;
  if (!LOCAL.test(host)) throw new Error(`click rig: refusing ${host}. The rig only runs on this computer.`);
  return url;
}

/** A long React message is mostly advice: keep the first line, and the lines that say what actually differed. */
function tellingPart(text) {
  const diff = text.split("\n").filter((l) => /^\s*[+-]\s/.test(l)).join(" ").replace(/\s+/g, " ");
  return `${text.split("\n")[0].slice(0, 120)}${diff ? ` :: ${diff.slice(0, 240)}` : ""}`;
}

/** Is the server up at all? */
async function benchAnswers(url, path = "/") {
  try { await fetch(new URL(path, url), { redirect: "manual", signal: AbortSignal.timeout(10_000) }); return true; } catch { return false; }
}

export class Humie {
  /** settings: oldNames, leaks, errorWords, noise, outsideHosts (hosts allowed during a payment step), quietSockets, alivePath */
  constructor({ browser, report, track, viewport, who, storageState, skipSweeps = false, settings = {} }) {
    Object.assign(this, { browser, report, track, viewport, who, storageState, skipSweeps, settings });
    this.noise = [];
    this.gone = new Set();
    this.scannedAxe = new Set();
    this.allowPayHosts = false;
  }

  async start() {
    const { width, height, ...device } = VIEWPORTS[this.viewport];
    this.context = await this.browser.newContext({ viewport: { width, height }, ...device, storageState: this.storageState, acceptDownloads: true, ignoreHTTPSErrors: false });
    this.context.setDefaultTimeout(STEP_MS);
    this.context.setDefaultNavigationTimeout(PAGE_MS);
    // the wall: nothing leaves this computer but the test payment pages, and those only during a payment step
    await this.context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (LOCAL.test(url.hostname) || url.protocol === "data:" || url.protocol === "blob:") return route.continue();
      if (this.allowPayHosts && (this.settings.outsideHosts ?? []).some((re) => re.test(url.hostname))) return route.continue();
      return route.abort("blockedbyclient");
    });
    if (this.settings.quietSockets) await this.context.routeWebSocket(this.settings.quietSockets, () => {}); // stays open, says nothing
    this.page = await this.context.newPage();
    this.watch(this.page);
    return this;
  }

  watch(page) {
    page.on("pageerror", (e) => this.noise.push({ check: "page-error", detail: String(e.message ?? e).split("\n")[0].slice(0, 200) }));
    page.on("console", (m) => { if (m.type() === "error" && !isNoise(`${m.text()} ${m.location().url}`, this.settings.noise)) this.noise.push({ check: "console-error", detail: tellingPart(m.text()) }); });
    page.on("response", (r) => {
      remember(r.url(), r.request().resourceType());
      if (r.status() >= 500 && !this.allowPayHosts) this.noise.push({ check: "server-error", detail: `${r.status()} ${new URL(r.url()).pathname}` });
    });
  }

  /** A walk that opened tabs ends with them closed, so the next walk starts where a person would. */
  async backToFirstTab() {
    const [first, ...rest] = this.context.pages();
    for (const tab of rest) await tab.close().catch(() => {});
    if (first) this.page = first;
  }

  async close() { await this.context?.close(); }
  async savedLogin() { return this.context.storageState(); }

  // ── moving around ──
  async go(url) {
    await this.page.goto(assertLocalUrl(url), { waitUntil: "domcontentloaded" }).catch(async (error) => {
      if (/Timeout/.test(error.message) && !(await benchAnswers(url, this.settings.alivePath))) throw new Outside("The bench server stopped answering. That's the bench, not this screen.");
      if (!/ERR_ABORTED/.test(error.message)) throw error;
      await this.page.waitForTimeout(800); // a dev server recompiling can drop one navigation; a person just presses again
      await this.page.goto(url, { waitUntil: "domcontentloaded" });
    });
    await this.settle();
  }

  async settle(ms = 350) {
    await this.page.waitForLoadState("load", { timeout: PAGE_MS }).catch(() => {});
    await this.page.waitForTimeout(ms);
  }

  /** The control a person would point at, by its words. */
  find(name, role) {
    const re = name instanceof RegExp ? name : new RegExp(`^\\s*${String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
    if (role) return this.page.getByRole(role, { name: re });
    return this.page.getByRole("button", { name: re }).or(this.page.getByRole("link", { name: re })).or(this.page.getByRole("switch", { name: re })).or(this.page.getByRole("tab", { name: re })).or(this.page.getByRole("menuitem", { name: re }));
  }

  async press(name, role) {
    const target = this.find(name, role).filter({ visible: true }).first();
    await target.scrollIntoViewIfNeeded();
    if (VIEWPORTS[this.viewport].hasTouch) await target.tap(); else await target.click();
    await this.settle();
  }

  /** Opens a fold-out section by its heading, if it isn't open already. */
  async fold(name) {
    const head = this.page.locator("summary").filter({ hasText: name }).filter({ visible: true }).first();
    await head.scrollIntoViewIfNeeded();
    if (await head.evaluate((el) => !el.parentElement.open)) {
      if (VIEWPORTS[this.viewport].hasTouch) await head.tap(); else await head.click();
      await this.settle(200);
    }
  }

  /** A switch: the real checkbox hides behind its track, so a finger lands on the label around it. */
  async flip(target) {
    const label = target.locator("xpath=ancestor::label[1]");
    const spot = (await label.count()) ? label : target;
    await spot.scrollIntoViewIfNeeded();
    if (VIEWPORTS[this.viewport].hasTouch) await spot.tap(); else await spot.click();
    await this.settle(300);
  }

  /** A card-style choice: the words sit on a label, the real radio is hidden behind it. */
  async pick(words) {
    const card = this.page.locator("label").filter({ hasText: words }).filter({ visible: true }).first();
    await card.scrollIntoViewIfNeeded();
    if (VIEWPORTS[this.viewport].hasTouch) await card.tap(); else await card.click();
    await this.settle(150);
  }

  async type(label, value) {
    const box = this.page.getByLabel(label).filter({ visible: true }).first();
    await box.scrollIntoViewIfNeeded();
    await box.fill(value);
  }

  async choose(label, option) {
    const box = this.page.getByLabel(label).filter({ visible: true }).first();
    await box.selectOption(option);
    await this.settle(150);
  }

  async see(text, timeout = STEP_MS) {
    const re = text instanceof RegExp ? text : new RegExp(String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    await this.page.getByText(re).filter({ visible: true }).first().waitFor({ state: "visible", timeout });
  }

  /** Waits for a control a person could press right now. */
  async seeControl(name, role) { await this.find(name, role).filter({ visible: true }).first().waitFor({ state: "visible" }); }

  async notSee(text) {
    const re = text instanceof RegExp ? text : new RegExp(String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const n = await this.page.getByText(re).filter({ visible: true }).count();
    if (n) throw new Error(`"${text}" should not be on this screen`);
  }

  /** Clicks a menu button when the screen is small enough to hide the links behind one. */
  async openMenuIfHidden(linkName, menuName = /menu/i) {
    const link = this.find(linkName).filter({ visible: true }).first();
    if (await link.isVisible().catch(() => false)) return;
    await this.press(menuName);
    await this.settle(200);
  }

  /** Something a person would trip on that the step can work around: it lands on this step's row. */
  flag(check, detail) { this.noise.push({ check, detail }); }

  // ── the gate every screen goes through ──
  async check(screen, opts = {}) {
    await this.settle(opts.wait ?? 250);
    const scan = () => this.page.evaluate(pageScan, scanArgs(opts, VIEWPORTS[this.viewport].width, this.settings));
    // a dev server's hot reload can swap the page out mid-look: look again once it lands
    const found = await scan().catch(async () => { await this.settle(1200); return scan(); }).catch((e) => [{ check: "scan-failed", detail: String(e.message).slice(0, 160) }]);
    const key = (this.settings.axeKey ?? ((path) => path))(new URL(this.page.url()).pathname); // settle ids here to scan a page once per shape
    if (opts.axe !== false && !this.scannedAxe.has(key)) {
      this.scannedAxe.add(key);
      found.push(...await axeScan(this.page).catch((e) => [{ check: "scan-failed", detail: `axe: ${String(e.message).slice(0, 140)}` }]));
    }
    found.push(...this.noise.splice(0));
    return this.report.screen({ track: this.track, viewport: this.viewport, who: this.who, screen, url: this.page.url(), page: this.page, found: dedupe(found), shot: opts.shot !== false, money: Boolean(opts.money) });
  }
}

function dedupe(found) {
  const seen = new Set();
  return found.filter((f) => { const k = `${f.check}|${f.detail}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
