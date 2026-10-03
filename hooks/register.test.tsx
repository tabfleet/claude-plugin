import { expect, mock, test } from 'claude-code/testing'

const ACTIVE = 'aaaaaaaa-1111-4111-8111-111111111111'
const text = (v: unknown) => ({ value: { content: [{ type: 'text' as const, text: JSON.stringify(v) }], isError: false } })

test('pane lists active browsers and Close calls close_browser', async ($, on) => {
  mock.clock(on, { now: Date.now() })
  const closed: string[] = []
  on('mcp.connect', () => ({ value: { isConnected: true as const, server: 'plugin:tabfleet-browser:tabfleet' } }))
  on('mcp.call', ($, e) => {
    expect(e.server).toBe('plugin:tabfleet-browser:tabfleet')
    if (e.tool === 'list_sessions')
      return text({
        sessions: closed.length
          ? []
          : [{ id: ACTIVE, status: 'active', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 600_000).toISOString() }],
      })
    if (e.tool === 'get_usage') return text({ activeSessions: closed.length ? 0 : 1, budget: { availableSeconds: 6000 } })
    if (e.tool === 'close_browser') {
      closed.push(String(e.args.sessionId))
      return text({ ok: true })
    }
    return text({})
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    closed.length = 0
    const ui = await $.ui.mount({
      plugin: 'tabfleet-browser',
      surface,
      component: 'Pane',
      requestId: 'tabfleet-browser',
      props: { title: 'Tabfleet', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
    })
    await ui.press({ key: 'refresh' })
    expect(await ui.find({ type: 'Text', text: /aaaaaaaa · active/ })).toBeDefined()
    await ui.press({ key: `close-${ACTIVE}` })
    expect(closed).toEqual([ACTIVE])
    expect(await ui.find({ type: 'Text', text: /No active browsers/ })).toBeDefined()
    await ui.unmount()
  }
})

const PNG_1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

test('Watch asks for a PNG screenshot and draws it inline', async ($, on) => {
  mock.clock(on, { now: Date.now() })
  const asked: unknown[] = []
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.status', () => ({ value: undefined }))
  on('mcp.connect', () => ({ value: { isConnected: true as const, server: 'plugin:tabfleet-browser:tabfleet' } }))
  on('mcp.call', ($, e) => {
    if (e.tool === 'list_sessions')
      return text({
        sessions: [{ id: ACTIVE, status: 'active', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 600_000).toISOString() }],
      })
    if (e.tool === 'get_usage') return text({ activeSessions: 1, budget: { availableSeconds: 6000 } })
    if (e.tool === 'browser_screenshot') {
      asked.push(e.args)
      return { value: { content: [{ type: 'image' as const, data: PNG_1x1, mimeType: 'image/png' }], isError: false } }
    }
    return text({})
  })

  const ui = await $.ui.mount({
    plugin: 'tabfleet-browser',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'tabfleet-browser',
    props: { title: 'Tabfleet', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
  })
  await ui.press({ key: 'refresh' })
  await ui.press({ key: `watch-${ACTIVE}` })
  expect(asked).toEqual([{ sessionId: ACTIVE, format: 'png' }])
  expect(await ui.find({ type: 'Image' })).toBeDefined()
  await ui.unmount()
})
