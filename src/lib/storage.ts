import type { AppState, Measurement, Session } from './types'

const KEY = 'timegraph.state.v1'

export function emptyState(): AppState {
  return { version: 1, sessions: [], activeSessionId: null }
}

export function newId(): string {
  return crypto.randomUUID()
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyState()
    const parsed = JSON.parse(raw) as AppState
    if (parsed?.version !== 1 || !Array.isArray(parsed.sessions)) return emptyState()
    return parsed
  } catch {
    return emptyState()
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch (err) {
    // Thumbnails are the only thing here big enough to blow the quota, and
    // losing a reading is worse than losing its picture.
    console.warn('could not persist state', err)
  }
}

export function createSession(startedAt: number, label?: string): Session {
  return {
    id: newId(),
    startedAt,
    label: label ?? `Set ${new Date(startedAt).toLocaleDateString()}`,
    measurements: [],
  }
}

export function addMeasurement(state: AppState, m: Measurement): AppState {
  let sessions = state.sessions
  let activeId = state.activeSessionId

  if (!activeId || !sessions.some((s) => s.id === activeId)) {
    const session = createSession(m.takenAt)
    sessions = [...sessions, session]
    activeId = session.id
  }

  return {
    ...state,
    activeSessionId: activeId,
    sessions: sessions.map((s) =>
      s.id === activeId ? { ...s, measurements: [...s.measurements, m] } : s,
    ),
  }
}

export function deleteMeasurement(state: AppState, sessionId: string, measurementId: string): AppState {
  return {
    ...state,
    sessions: state.sessions.map((s) =>
      s.id === sessionId
        ? { ...s, measurements: s.measurements.filter((m) => m.id !== measurementId) }
        : s,
    ),
  }
}

export function startNewSession(state: AppState, startedAt: number, label?: string): AppState {
  const session = createSession(startedAt, label)
  return { ...state, sessions: [...state.sessions, session], activeSessionId: session.id }
}

export function deleteSession(state: AppState, sessionId: string): AppState {
  const sessions = state.sessions.filter((s) => s.id !== sessionId)
  return {
    ...state,
    sessions,
    activeSessionId:
      state.activeSessionId === sessionId ? (sessions[sessions.length - 1]?.id ?? null) : state.activeSessionId,
  }
}

export function exportState(state: AppState): string {
  // Thumbnails dominate the file size and mean nothing outside the app.
  const slim: AppState = {
    ...state,
    sessions: state.sessions.map((s) => ({
      ...s,
      measurements: s.measurements.map(({ thumbnail: _thumbnail, ...rest }) => rest),
    })),
  }
  return JSON.stringify(slim, null, 2)
}

export function importState(json: string): AppState {
  const parsed = JSON.parse(json) as AppState
  if (parsed?.version !== 1 || !Array.isArray(parsed.sessions)) {
    throw new Error('Not a Timegraph export')
  }
  return parsed
}
