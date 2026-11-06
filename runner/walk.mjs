// A track is a list of walks. A walk is ordered steps by one person: if a step can't be done, the rest of that walk
// can't either, so it stops there and the next walk starts. Every step ends at the same gate (Humie.check).
export class Stop extends Error {}
/** An outside service didn't play along (never a bug of ours, never a pass): the step reads SKIP with the reason. */
export class Outside extends Error {}

export function walker({ report, track, viewport, keep = () => true }) {
  return async function walk(h, name, run) {
    if (!keep(name)) return true;
    const step = async (screen, fn, opts = {}) => {
      const label = `${name}: ${screen}`;
      report.now?.({ track, viewport, step: label });
      try {
        await fn();
      } catch (error) {
        if (error instanceof Outside) report.skipped({ track, viewport, who: h.who, screen: label, why: error.message, money: Boolean(opts.money) });
        else await report.stepFailed({ track, viewport, who: h.who, screen: label, page: h.page, error, money: Boolean(opts.money) });
        throw new Stop(label);
      }
      await h.check(label, opts);
    };
    step.skip = (screen, why) => report.skipped({ track, viewport, who: h.who, screen: `${name}: ${screen}`, why });
    try {
      await run(step);
      return true;
    } catch (error) {
      if (!(error instanceof Stop)) await report.stepFailed({ track, viewport, who: h.who, screen: `${name}: walk stopped`, page: h.page, error });
      return false;
    } finally {
      await h.backToFirstTab();
    }
  };
}

/** Walks a list of screens by address: the sweep every role gets. Each address is its own step, so one bad page doesn't stop the rest. */
export async function sweep(h, walk, name, base, paths, opts = {}) {
  if (h.skipSweeps) return; // a short exam walks what it names, not every screen
  for (const [label, path, screenOpts] of paths) {
    await walk(h, name, async (step) => step(label, async () => { await h.go(`${base}${path}`); await h.settle(300); }, { ...opts, ...screenOpts }));
  }
}
