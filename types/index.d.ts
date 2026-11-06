/** One step that didn't pass, as the rig wrote it. */
export type Problem = { status: 'FAIL' | 'SKIP'; money: boolean; size: string; step: string; detail: string }

export type Track = {
  name: string
  done: number
  total: number | null
  passes: number
  fails: number
  skips: number
  now: { size: string; step: string } | null
  grade: string
  score: number | null
  why: string
  problems: Problem[]
  known: string[]
  lastPasses: { size: string; step: string }[]
}

/** ~/.claude/clickrig/live.json: the whole of what the sidebar knows. */
export type Live = {
  state: 'running' | 'done'
  startedAt: string
  updatedAt: string
  finishedAt?: string
  commit?: string
  pass?: boolean
  reportDir?: string
  tracks: Record<string, Track>
}

declare module 'claude-code' {
  interface PluginState {
    'click-rig': { live: Live | null }
  }
}
