// The red-marker grade for one track. GRADES.md says the same thing in words: change them together.
const BANDS = [[97, "B+"], [94, "B"], [90, "B-"], [87, "C+"], [83, "C"], [80, "C-"], [77, "D+"], [70, "D"], [60, "D-"]];
const ORDER = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"];

/** rows: every step of a track so far. known: the known-issues list. Returns { grade, score, why }. */
export function gradeTrack(rows, known = []) {
  const passed = rows.filter((r) => r.status === "PASS").length;
  const failed = rows.filter((r) => r.status === "FAIL").length;
  const graded = passed + failed;
  if (!graded) return { grade: "?", score: null, why: "Nothing graded yet." };
  const benchDown = rows.filter((r) => r.status === "SKIP" && r.issues.some((i) => /stopped answering/.test(i.detail))).length;
  if (benchDown) return { grade: "?", score: null, why: `No grade: the bench stopped answering on ${benchDown} steps. Fix the bench and run it again.` };
  const score = (passed / graded) * 100;
  const ids = new Set(rows.flatMap((r) => r.issues.filter((i) => i.known).map((i) => i.known)));
  const moneyKnown = [...ids].filter((id) => known.find((k) => k.id === id)?.money);
  const moneyFailed = rows.filter((r) => r.money && r.status === "FAIL");
  if (moneyFailed.length) return { grade: "F", score, why: `Failed a money check: ${moneyFailed[0].step}.` };
  if (moneyKnown.length) return { grade: "F", score, why: `Open money bug: ${moneyKnown[0]}.` };
  if (score < 60) return { grade: "F", score, why: `Only ${Math.round(score)}% of steps passed.` };

  let grade;
  if (failed) grade = (BANDS.find(([floor]) => score >= floor) ?? [0, "D-"])[1];
  else grade = ids.size === 0 ? "A+" : ids.size <= 2 ? "A" : "A-";
  const why = [`${passed} of ${graded} steps passed.`];
  if (ids.size) why.push(`${ids.size} known ${ids.size === 1 ? "issue" : "issues"} still open.`);
  // a money check nobody could finish proves nothing: a C at best
  const moneySkipped = rows.filter((r) => r.money && r.status === "SKIP");
  if (moneySkipped.length && ORDER.indexOf(grade) < ORDER.indexOf("C")) { grade = "C"; why.push(`Money check not finished: ${moneySkipped[0].step}.`); }
  return { grade, score, why: why.join(" ") };
}
