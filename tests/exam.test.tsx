import { expect, test } from 'claude-code/testing'

import type { Live } from '../types'
import { examAlt, examSvg } from '../hooks/art'

const track = { name: 'Customer', done: 40, total: 90, passes: 38, fails: 2, skips: 0, now: { size: 'phone', step: 'contract: sign' }, grade: 'F', score: 95, why: 'Failed a money check: pay today.', known: [], lastPasses: [],
  problems: [{ status: 'FAIL' as const, money: true, size: 'phone', step: 'pay today: <test card>', detail: '' }] }
const live: Live = { state: 'running', startedAt: 'a', updatedAt: 'b', tracks: { customer: track } }

test('the sheet shows the grade, marks a money miss, and escapes what the rig wrote', async () => {
  const svg = examSvg(live)
  expect(svg).toContain('>F<')
  expect(svg).toContain('$ ✗')
  expect(svg).toContain('&lt;test card&gt;')
  expect(svg).not.toContain('<test card>')
  expect(examAlt(live)).toContain('Customer: grade F')
})

test('an empty sheet says how to start', async () => {
  expect(examSvg(null)).toContain('Run your test rig')
})
