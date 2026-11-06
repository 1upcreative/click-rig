// The exam sheet as one SVG string: notebook paper, blue rules, a red margin line, and a grade in red marker.
// Pure, so a test can read it. Words come from the rig's live file, escaped, because a step name is data.
import type { Live, Track } from '../types'

const W = 420
const INK = '#22304a'
const RED = '#c8102e'
const PAPER = '#fdfbf0'
const RULE = '#bcd3ea'
const MARGIN = 44
const HAND = "'Bradley Hand', 'Marker Felt', 'Comic Sans MS', cursive"
const MARKER = "'Marker Felt', 'Chalkduster', 'Comic Sans MS', cursive"
const LINE = 24

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const SIZE: Record<string, string> = { desktop: 'desk', phone: '320', landscape: 'side' }

export type Faces = Record<string, string | undefined>

function avatar(key: string, track: Track, faces: Faces, x: number, y: number): string {
  const face = faces[key]
  if (face) return `<image href="${face}" x="${x}" y="${y}" width="58" height="65" style="image-rendering:pixelated"/>`
  return `<circle cx="${x + 28}" cy="${y + 32}" r="26" fill="none" stroke="${INK}" stroke-width="2" stroke-dasharray="4 4"/><text x="${x + 28}" y="${y + 42}" text-anchor="middle" font-family="${HAND}" font-size="28" fill="${INK}">${esc(track.name[0] ?? '?')}</text>`
}

function grade(track: Track, x: number, y: number): string {
  const letter = esc(track.grade)
  const live = track.grade === '?'
  return `<g transform="rotate(-7 ${x} ${y})"><text x="${x}" y="${y + 15}" text-anchor="middle" font-family="${MARKER}" font-size="46" font-weight="700" fill="${live ? '#b9b3a0' : RED}">${letter}</text>${live ? '' : `<ellipse cx="${x}" cy="${y}" rx="44" ry="33" fill="none" stroke="${RED}" stroke-width="3"/>`}</g>`
}

function block(key: string, t: Track, faces: Faces, y: number, running: boolean): { svg: string; height: number } {
  const left = MARGIN + 10
  const textX = left + 68
  const out: string[] = [avatar(key, t, faces, left, y + 4)]
  out.push(`<text x="${textX}" y="${y + 22}" font-family="${HAND}" font-size="22" font-weight="700" fill="${INK}">${esc(t.name)}</text>`)
  out.push(grade(t, W - 62, y + 28))
  const pct = t.total ? Math.min(1, t.done / t.total) : 0
  const bar = W - textX - 110
  out.push(`<rect x="${textX}" y="${y + 32}" width="${bar}" height="11" rx="2" fill="none" stroke="${INK}" stroke-width="1.5"/>`)
  out.push(`<rect x="${textX + 1}" y="${y + 33}" width="${(bar - 2) * pct}" height="9" fill="#3fb8ac"/>`)
  const counts = `${t.done}${t.total ? ` of ${t.total}` : ''} done · ✓ ${t.passes} · ✗ ${t.fails}${t.skips ? ` · skip ${t.skips}` : ''}`
  out.push(`<text x="${textX}" y="${y + 60}" font-family="${HAND}" font-size="14" fill="${INK}">${esc(counts)}</text>`)
  const line2 = running && t.now ? `now: ${cut(t.now.step, 38)} (${SIZE[t.now.size] ?? t.now.size})` : cut(t.why, 46)
  out.push(`<text x="${textX}" y="${y + 77}" font-family="${HAND}" font-size="13" fill="${INK}" opacity=".8">${esc(line2)}</text>`)
  let at = y + 96
  for (const p of t.problems.slice(-4)) {
    const mark = p.status === 'SKIP' ? 'skip' : p.money ? '$ ✗' : '✗'
    out.push(`<text x="${left}" y="${at}" font-family="${HAND}" font-size="13" fill="${p.status === 'SKIP' ? INK : RED}">${esc(`${mark} ${SIZE[p.size] ?? p.size}: ${cut(p.step, 52)}`)}</text>`)
    at += 17
  }
  if (t.problems.length > 4) { out.push(`<text x="${left}" y="${at}" font-family="${HAND}" font-size="12" fill="${RED}">${esc(`and ${t.problems.length - 4} more on the report`)}</text>`); at += 17 }
  if (t.known.length) { out.push(`<text x="${left}" y="${at}" font-family="${HAND}" font-size="12" fill="${INK}" opacity=".75">${esc(`${t.known.length} known ${t.known.length === 1 ? 'issue' : 'issues'} still open`)}</text>`); at += 17 }
  return { svg: out.join(''), height: at - y + 8 }
}

export function examSvg(live: Live | null, faces: Faces = {}): string {
  const running = live?.state === 'running'
  const keys = Object.keys(live?.tracks ?? {})
  const blocks: string[] = []
  let y = 92
  for (const key of keys) {
    const b = block(key, live!.tracks[key]!, faces, y, running)
    blocks.push(b.svg)
    y += b.height
  }
  if (!keys.length) { blocks.push(`<text x="${MARGIN + 10}" y="130" font-family="${HAND}" font-size="17" fill="${INK}">No exam yet. Run your test rig to start one.</text>`); y = 170 }
  const H = Math.max(y + 34, 240)
  const rules = Array.from({ length: Math.ceil(H / LINE) }, (_, i) => `<line x1="0" x2="${W}" y1="${60 + i * LINE}" y2="${60 + i * LINE}" stroke="${RULE}"/>`).join('')
  const holes = [40, H / 2, H - 40].map((cy) => `<circle cx="14" cy="${cy}" r="7" fill="#d9d4c3"/>`).join('')
  const subtitle = !live ? 'Standing by' : running ? 'Pencils down when it says so' : live.pass ? 'Finished: nothing new failed' : 'Finished: see me after class'
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${PAPER}"/>${rules}<line x1="${MARGIN}" x2="${MARGIN}" y1="0" y2="${H}" stroke="#e7a3a3" stroke-width="2"/>${holes}<text x="${MARGIN + 10}" y="36" font-family="${MARKER}" font-size="27" fill="${INK}">Click Rig Exam</text><text x="${MARGIN + 10}" y="58" font-family="${HAND}" font-size="15" fill="${running ? INK : live?.pass ? '#1d7a4d' : RED}">${esc(subtitle)}</text>${blocks.join('')}</svg>`
}

/** What a screen reader gets. */
export function examAlt(live: Live | null): string {
  if (!live) return 'Click rig exam, standing by'
  const lines = Object.values(live.tracks).map((t) => `${t.name}: grade ${t.grade}, ${t.passes} passed, ${t.fails} failed`)
  return `Click rig exam, ${live.state}. ${lines.join('. ')}`
}
