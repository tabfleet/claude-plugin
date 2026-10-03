import { atom, read, update } from 'claude-code'
import type { EngineInterface, McpToolResult, Register } from 'claude-code'

import type { FleetSession, FleetSnapshot, FleetUsage, FleetWatch } from '../types'

const PANE = 'tabfleet-browser'
const POLL_MS = 20_000
const FRAME_MS = 1_500
const FRAME_DIR = '/tmp/tabfleet-fleet'
// Tool names as the session spells them: mcp__tabfleet__*, or mcp__plugin_tabfleet-browser_tabfleet__* when this plugin ships the server.
const TABFLEET = /^mcp__(?:plugin_[^_]+_)?tabfleet__/
const LAUNCH = /^mcp__(?:plugin_[^_]+_)?tabfleet__launch_browser$/

const snapshot = atom({ plugin: 'tabfleet-browser', key: 'snapshot' } as const, {
  sessions: [],
  usage: null,
  liveViews: {},
  error: null,
  launchedHere: [],
} as FleetSnapshot)

const watch = atom({ plugin: 'tabfleet-browser', key: 'watch' } as const, {
  sessionId: null,
  frame: null,
  error: null,
} as FleetWatch)

let isCapturing = false
let server: string | undefined
// Live watching converts screenshots with macOS sips; elsewhere the pane offers live-view links only.
let canWatch = false

// This plugin's own tabfleet server, under whatever name the session runs it.
async function call($: EngineInterface, tool: string, args?: Record<string, unknown>) {
  if (!server) {
    const conn = await $.mcp.connect('tabfleet')
    if (!conn.isConnected) throw new Error(conn.message)
    server = conn.server
  }

  return $.mcp.call(server, tool, args)
}

// The screenshot as inline base64, or as a local file the host saved it to.
function imageSource(shot: McpToolResult): { base64: string } | { file: string } | undefined {
  for (const b of shot.content) {
    const res = (b.resource ?? {}) as Record<string, unknown>
    const src = (b.source ?? {}) as Record<string, unknown>
    const data = b.data ?? b.blob ?? res.blob ?? src.data
    if (typeof data === 'string' && data.length > 0) return { base64: data }
    const uri = b.uri ?? res.uri ?? b.path ?? b.file
    if (typeof uri === 'string' && (uri.startsWith('file://') || uri.startsWith('/')))
      return { file: uri.startsWith('file://') ? decodeURIComponent(new URL(uri).pathname) : uri }
  }
  // Fallback: the host's note naming where it saved the image, "[Image: source: /path.jpg]".
  for (const b of shot.content) {
    const saved = typeof b.text === 'string' ? /\[Image: source: (\/[^\]]+)\]/.exec(b.text)?.[1] : undefined
    if (saved) return { file: saved }
  }

  return undefined
}

// One frame: screenshot (JPEG) -> temp file -> PNG via macOS sips -> Image reads the file.
async function capture($: EngineInterface) {
  const w = await read($, watch)
  if (!w.sessionId || isCapturing) return
  isCapturing = true
  try {
    const shot = await call($, 'browser_screenshot', { sessionId: w.sessionId })
    const source = imageSource(shot)
    if (!source) {
      const shape = shot.content.map(b => `${b.type}{${Object.keys(b).join(',')}}`).join(' ')
      throw new Error(`no screenshot (${shot.isError ? 'error: ' : ''}${shape || 'empty'})`)
    }

    const generation = (w.frame?.generation ?? 0) + 1
    const path = `${FRAME_DIR}/${w.sessionId}-${generation % 2}.png`
    const convert = 'sips -s format png -Z 1280 "$1/in.jpg" --out "$2" >/dev/null && sips -g pixelWidth -g pixelHeight "$2"'
    const ran = await $.process.run(
      'base64' in source
        ? ['/bin/sh', '-c', `mkdir -p "$1" && base64 -D > "$1/in.jpg" && ${convert}`, 'sh', FRAME_DIR, path]
        : ['/bin/sh', '-c', `mkdir -p "$1" && cp "$3" "$1/in.jpg" && ${convert}`, 'sh', FRAME_DIR, path, source.file],
      { stdin: 'base64' in source ? source.base64 : undefined, timeoutMs: 10_000 },
    )
    if (ran.exitCode !== 0) throw new Error(ran.stderr.trim() || 'sips failed')

    const width = Number(/pixelWidth: (\d+)/.exec(ran.stdout)?.[1] ?? 1280)
    const height = Number(/pixelHeight: (\d+)/.exec(ran.stdout)?.[1] ?? 720)
    await update($, watch, cur =>
      cur.sessionId === w.sessionId ? { ...cur, frame: { path, generation, width, height }, error: null } : cur,
    )
  } catch (err) {
    await update($, watch, cur => ({ ...cur, error: String((err as Error).message ?? err) }))
  } finally {
    isCapturing = false
  }
}

// Watching wants room: tall inline above the prompt, wide when docked as a sidebar.
const openPane = ($: EngineInterface, isWatching: boolean) =>
  $.ui.open({ id: PANE, title: 'Tabfleet', ...(isWatching ? { rows: 40, columns: 100 } : {}) })

async function startWatching($: EngineInterface, sessionId: string) {
  await update($, watch, () => ({ sessionId, frame: null, error: null }))
  await openPane($, true)
  await capture($)
}

const stopWatching = ($: EngineInterface) => update($, watch, () => ({ sessionId: null, frame: null, error: null }))

function parse(result: McpToolResult): any {
  const block = result.content.find(b => b.type === 'text') as { text?: string } | undefined
  if (result.isError) throw new Error(block?.text ?? 'Tabfleet call failed')

  return result.structuredContent ?? JSON.parse(block?.text ?? '{}')
}

const isActive = (s: FleetSession) => s.status !== 'closed' && s.status !== 'failed'

function minutesLeft(s: FleetSession, now: number) {
  return Math.max(0, Math.round((Date.parse(s.expiresAt) - now) / 60_000))
}

async function refresh($: EngineInterface) {
  try {
    const [list, usage] = await Promise.all([
      call($, 'list_sessions', { limit: 20 }).then(parse),
      call($, 'get_usage').then(parse),
    ])
    const sessions: FleetSession[] = list.sessions ?? []
    const fleetUsage: FleetUsage = {
      activeSessions: usage.activeSessions ?? 0,
      availableSeconds: usage.budget?.availableSeconds ?? 0,
    }
    await update($, snapshot, s => ({ ...s, sessions, usage: fleetUsage, error: null }))
    const watched = (await read($, watch)).sessionId
    if (watched && !sessions.some(x => x.id === watched && isActive(x))) await stopWatching($)

    const active = fleetUsage.activeSessions
    const left = Math.round(fleetUsage.availableSeconds / 60)
    $.ui.status(active > 0 ? `⛵ ${active} browser${active === 1 ? '' : 's'} · ${left} min left` : undefined)

    return sessions
  } catch (err) {
    await update($, snapshot, s => ({ ...s, error: String((err as Error).message ?? err) }))

    return []
  }
}

async function liveView($: EngineInterface, sessionId: string) {
  try {
    const view = parse(await call($, 'get_live_view', { sessionId, mode: 'view', ttlSeconds: 900 }))
    const url: string | undefined = view.url ?? view.liveViewUrl ?? view.viewerUrl
    if (url) await update($, snapshot, s => ({ ...s, liveViews: { ...s.liveViews, [sessionId]: url } }))

    return url
  } catch {
    return undefined
  }
}

async function close($: EngineInterface, sessionId: string) {
  try {
    parse(await call($, 'close_browser', { sessionId }))
    $.ui.toast(`Closed browser ${sessionId.slice(0, 8)}`)
  } catch (err) {
    $.ui.toast(`Close failed: ${(err as Error).message}`)
  }
  await refresh($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    void $.process.run(['uname', '-s'], { timeoutMs: 5_000 }).then(
      r => (canWatch = r.stdout.trim() === 'Darwin'),
      () => undefined,
    )
    await $.command.register({ name: 'fleet', description: 'Open the Tabfleet browser fleet pane' })
    await $.command.register({ name: 'fleet-watch', description: 'Watch the newest active Tabfleet browser in the fleet pane' })
    await $.command.register({ name: 'fleet-close-all', description: 'Close every active Tabfleet browser' })
    // No fleet call here: idle sessions cost nothing until a tabfleet tool or /fleet runs.
    $.clock.every(FRAME_MS, () => void capture($))
    $.clock.every(POLL_MS, () => {
      void read($, snapshot).then(s => {
        if ((s.usage?.activeSessions ?? 0) > 0) void refresh($)
      })
    })

    return next(e)
  })

  on('command.run', { command: 'fleet' }, async $ => {
    await refresh($)
    await openPane($, (await read($, watch)).sessionId !== null)

    return { text: 'Tabfleet pane opened.' }
  })

  on('command.run', { command: 'fleet-watch' }, async ($, e) => {
    if (!canWatch) return { text: 'Watching needs macOS (it converts screenshots with sips). Use /fleet for live-view links.' }

    const active = (await refresh($)).filter(isActive)
    const newest = active[0]
    if (!newest) return { text: 'No active browsers to watch.' }

    void startWatching($, newest.id)

    const { isFullscreen, columns } = e.presentation
    const where =
      isFullscreen && columns >= 110
        ? 'docked as a sidebar'
        : isFullscreen
          ? `above the prompt: the terminal is ${columns} columns, and the sidebar needs 110+`
          : 'above the prompt: the sidebar needs fullscreen (/tui fullscreen)'

    return { text: `Watching ${newest.id.slice(0, 8)} (${where}).` }
  })

  on('command.run', { command: 'fleet-close-all' }, async $ => {
    const active = (await refresh($)).filter(isActive)
    for (const s of active) await close($, s.id)

    return { text: active.length ? `Closed ${active.length} browser(s).` : 'No active browsers.' }
  })

  // After the model launches a browser: remember it, fetch a live view, show it.
  on('tool.call', { tool: LAUNCH }, async ($, e, next) => {
    const before = new Set((await read($, snapshot)).sessions.map(s => s.id))
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran

    const fresh = (await refresh($)).filter(s => isActive(s) && !before.has(s.id))
    for (const s of fresh) {
      await update($, snapshot, st => ({ ...st, launchedHere: [...st.launchedHere, s.id] }))
      const url = await liveView($, s.id)
      $.ui.toast(url ? `Browser up · live view in /fleet` : `Browser ${s.id.slice(0, 8)} launched`)
    }

    return ran
  })

  // Any other tabfleet call may change the fleet; refresh afterwards.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (TABFLEET.test(e.tool) && !LAUNCH.test(e.tool)) void refresh($)

    return ran
  })

  // Return unused minutes: close browsers this session launched.
  on('session.end', async ($, e, next) => {
    const { sessions, launchedHere } = await read($, snapshot)
    const open = sessions.filter(s => isActive(s) && launchedHere.includes(s.id))
    await Promise.all(open.map(s => call($, 'close_browser', { sessionId: s.id }).catch(() => undefined)))

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button, Link } = els
    const Image = 'Image' in els ? els.Image : undefined
    const s = await read($, snapshot)
    const w = await read($, watch)
    const cols = Math.max(20, e.props.bodyColumns - 2)
    const now = await $.clock.now()
    const active = s.sessions.filter(isActive)
    const recent = w.sessionId ? [] : s.sessions.filter(x => !isActive(x)).slice(0, 5)

    // Fit the frame inside the pane: rows left after the text above, ~2 rows per column of width.
    const used = 4 + (s.error ? 1 : 0) + active.reduce((n, x) => n + (s.liveViews[x.id] ? 2 : 1), 0) + 1 + (w.error ? 1 : 0)
    const freeRows = Math.max(4, e.props.scroll.bodyRows - used)
    const aspect = w.frame ? w.frame.height / w.frame.width : 9 / 16
    const imageRows = Math.min(255, freeRows, Math.max(4, Math.round((cols * aspect) / 2)))
    const imageCols = Math.min(cols, Math.round((imageRows * 2) / aspect))

    return (
      <Box flexDirection="column">
        {s.error && <Text color="red">Tabfleet: {s.error}</Text>}
        {s.usage && (
          <Text dimColor>
            {s.usage.activeSessions} active · {Math.round(s.usage.availableSeconds / 60)} min available
          </Text>
        )}
        <Box>
          <Button key="refresh" label="Refresh" hotkey="r" onPress={() => refresh($)} />
        </Box>
        <Text bold>Active</Text>
        {active.length === 0 && <Text dimColor>No active browsers.</Text>}
        {active.map(x => {
          const url = s.liveViews[x.id]

          return (
          <Box flexDirection="column">
            <Box>
              <Text>
                {x.id.slice(0, 8)} · {x.status} · {minutesLeft(x, now)} min left{' '}
              </Text>
              <Button key={`close-${x.id}`} label="Close" onPress={() => close($, x.id)} />
              {w.sessionId === x.id ? (
                <Button key="stop" label="Stop" hotkey="s" onPress={() => stopWatching($)} />
              ) : canWatch && (
                <Button key={`watch-${x.id}`} label="Watch" hotkey="w" onPress={() => startWatching($, x.id)} />
              )}
              {!url && (
                <Button key={`view-${x.id}`} label="Live view" onPress={() => liveView($, x.id)} />
              )}
            </Box>
            {url && <Link href={url} label="  ↳ open live view" />}
          </Box>
          )
        })}
        {w.sessionId && (
          <Box flexDirection="column">
            <Text bold>Watching {w.sessionId.slice(0, 8)}</Text>
            {w.error && <Text color="red">{w.error}</Text>}
            {!Image && <Text dimColor>This surface can't draw images.</Text>}
            {!w.frame && !w.error && <Text dimColor>Capturing first frame…</Text>}
            {w.frame && Image && (
              <Image
                key="live"
                source={{ file: w.frame.path, format: 'png', generation: w.frame.generation }}
                columns={imageCols}
                rows={imageRows}
                alt={`Browser ${w.sessionId.slice(0, 8)} screenshot`}
              />
            )}
          </Box>
        )}
        {recent.length > 0 && <Text bold>Recent</Text>}
        {recent.map(x => (
          <Text dimColor>
            {x.id.slice(0, 8)} · {x.status} · {x.allocatedSeconds ?? 0}s
          </Text>
        ))}
      </Box>
    )
  })
}
