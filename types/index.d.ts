export type FleetSession = {
  id: string
  status: string
  createdAt: string
  expiresAt: string
  allocatedSeconds?: number
}

export type FleetUsage = { activeSessions: number; availableSeconds: number }

export type FleetSnapshot = {
  sessions: FleetSession[]
  usage: FleetUsage | null
  liveViews: Record<string, string>
  error: string | null
  launchedHere: string[]
}

export type FleetWatch = {
  sessionId: string | null
  frame: { path: string; generation: number; width: number; height: number } | null
  error: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'tabfleet-browser': { snapshot: FleetSnapshot; watch: FleetWatch }
  }
}
