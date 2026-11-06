// A paper exam beside the chat. Your test rig writes ~/.claude/clickrig/live.json as it runs (README has the format);
// this reads it each second, opens the pane when a run starts, and toasts the grades when it ends.
// Faces load from ~/.claude/clickrig/art/approved/<track>.png: a missing one draws an initial.
import type { EngineInterface, Register } from 'claude-code'

import type { Live } from '../types'
import { examAlt, examSvg, type Faces } from './art'

const PANE = 'click-rig'
const TITLE = 'Click Rig'
const LIVE = { plugin: 'click-rig', key: 'live' } as const

let seen = ''
let openedFor = ''
let toldFor = ''
let faces: Faces = {}

async function loadFaces($: EngineInterface, home: string, keys: string[]): Promise<Faces> {
  const out: Faces = {}
  for (const key of keys) {
    if (!/^[\w-]+$/.test(key)) continue // a track name from the feed is data: it never walks out of the folder
    try {
      const { base64 } = await $.fs.read(`${home}/.claude/clickrig/art/approved/${key}.png`, { as: 'bytes' })
      out[key] = `data:image/png;base64,${base64}`
    } catch { /* no picture yet */ }
  }
  return out
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'clickrig', description: 'Open the click rig exam' })
    const home = (await $.env.get('HOME')) ?? ''
    const feed = `${home}/.claude/clickrig/live.json`
    $.clock.every(1000, async () => {
      let live: Live
      try {
        const text = await $.fs.read(feed)
        if (text === seen) return
        seen = text
        live = JSON.parse(text) as Live
      } catch {
        return
      }
      faces = await loadFaces($, home, Object.keys(live.tracks ?? {}))
      await $.state.set(LIVE, live)
      if (live.state === 'running' && openedFor !== live.startedAt) {
        openedFor = live.startedAt
        await $.ui.open({ id: PANE, title: TITLE })
      }
      if (live.state === 'done' && toldFor !== live.startedAt && openedFor === live.startedAt) {
        toldFor = live.startedAt
        $.ui.toast(`Click rig: ${Object.values(live.tracks).map(t => `${t.name} ${t.grade}`).join(' · ')}`)
      }
    })
    return next(e)
  })

  on('command.run', { command: 'clickrig' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: 'Click rig exam opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { value: live = null } = await $.state.get(LIVE)
    if (e.surface === 'desktop' || e.surface === 'vscode' || e.surface === 'mobile') {
      const { Svg } = $.ui.resolve(e)
      return <Svg source={examSvg(live, faces)} alt={examAlt(live)} />
    }
    const { Box, Text } = $.ui.resolve(e)
    if (!live) return <Text dimColor>No exam yet. Run your test rig to start one.</Text>
    return (
      <Box flexDirection="column">
        {Object.values(live.tracks).map(t => (
          <Text color={t.grade === 'F' ? 'red' : undefined}>{t.name}: {t.grade} · {t.passes} passed · {t.fails} failed</Text>
        ))}
      </Box>
    )
  })
}
