/**
 * NTP-style clock sync over HTTP.
 *
 * Each sample brackets a request with monotonic reads, assumes the network path
 * is symmetric, and places the server's timestamp at the midpoint of the round
 * trip. The sample with the lowest round-trip time is the most trustworthy, so
 * that one wins outright rather than being averaged with slower ones — averaging
 * would drag the estimate toward whichever samples were most delayed.
 */

export type SyncQuality = 'unsynced' | 'poor' | 'fair' | 'good'

export interface SyncState {
  /** Add to the device clock to get true time, in ms. */
  offsetMs: number
  /** Half-width of the confidence interval, in ms. */
  uncertaintyMs: number
  source: string | null
  lastSyncAt: number | null
  syncing: boolean
  quality: SyncQuality
  error: string | null
}

interface Sample {
  offsetMs: number
  rttMs: number
  source: string
  /** Resolution of the source itself, in ms — 1000 for a source that only reports whole seconds. */
  granularityMs: number
}

interface Source {
  name: string
  granularityMs: number
  read(signal: AbortSignal): Promise<number>
}

/** Monotonic epoch reading, immune to the device clock being stepped mid-request. */
function monoNow(): number {
  return performance.timeOrigin + performance.now()
}

function parseIsoAsUtc(raw: string): number {
  // Some APIs return a naive local-looking timestamp with more sub-second digits
  // than Date.parse is specified to handle. Normalise both.
  let s = raw.trim()
  s = s.replace(/(\.\d{3})\d+/, '$1')
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(s)) s += 'Z'
  const t = Date.parse(s)
  if (Number.isNaN(t)) throw new Error(`unparseable timestamp: ${raw}`)
  return t
}

const SOURCES: Source[] = [
  {
    // Edge-served and usually the lowest-latency option, with microsecond precision.
    name: 'cloudflare',
    granularityMs: 1,
    async read(signal) {
      const res = await fetch('https://cloudflare.com/cdn-cgi/trace', { cache: 'no-store', signal })
      if (!res.ok) throw new Error(`http ${res.status}`)
      const text = await res.text()
      const line = text.split('\n').find((l) => l.startsWith('ts='))
      if (!line) throw new Error('no ts field')
      const seconds = Number(line.slice(3))
      if (!Number.isFinite(seconds)) throw new Error('bad ts field')
      return seconds * 1000
    },
  },
  {
    name: 'timeapi.io',
    granularityMs: 1,
    async read(signal) {
      const res = await fetch('https://timeapi.io/api/Time/current/zone?timeZone=UTC', {
        cache: 'no-store',
        signal,
      })
      if (!res.ok) throw new Error(`http ${res.status}`)
      const json = (await res.json()) as { dateTime?: string }
      if (!json.dateTime) throw new Error('no dateTime field')
      return parseIsoAsUtc(json.dateTime)
    },
  },
  {
    name: 'worldtimeapi',
    granularityMs: 1,
    async read(signal) {
      const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC', {
        cache: 'no-store',
        signal,
      })
      if (!res.ok) throw new Error(`http ${res.status}`)
      const json = (await res.json()) as { utc_datetime?: string }
      if (!json.utc_datetime) throw new Error('no utc_datetime field')
      return parseIsoAsUtc(json.utc_datetime)
    },
  },
  {
    // Last resort: the HTTP Date header is only accurate to the whole second, so
    // this can confirm the device clock is roughly right but can't refine it.
    name: 'http-date',
    granularityMs: 1000,
    async read(signal) {
      const res = await fetch('https://cloudflare.com/cdn-cgi/trace', {
        method: 'HEAD',
        cache: 'no-store',
        signal,
      })
      const header = res.headers.get('date')
      if (!header) throw new Error('no Date header')
      const t = Date.parse(header)
      if (Number.isNaN(t)) throw new Error('bad Date header')
      // The header is truncated to the second, so the true instant is uniformly
      // distributed across the following second. Aim at the middle of it.
      return t + 500
    },
  },
]

async function takeSample(source: Source, timeoutMs: number): Promise<Sample> {
  const signal = AbortSignal.timeout(timeoutMs)
  const t0 = monoNow()
  const serverMs = await source.read(signal)
  const t1 = monoNow()
  const rttMs = t1 - t0
  return {
    offsetMs: serverMs - (t0 + t1) / 2,
    rttMs,
    source: source.name,
    granularityMs: source.granularityMs,
  }
}

function qualityFor(uncertaintyMs: number): SyncQuality {
  if (uncertaintyMs <= 50) return 'good'
  if (uncertaintyMs <= 250) return 'fair'
  return 'poor'
}

const INITIAL: SyncState = {
  offsetMs: 0,
  uncertaintyMs: Infinity,
  source: null,
  lastSyncAt: null,
  syncing: false,
  quality: 'unsynced',
  error: null,
}

type Listener = (state: SyncState) => void

class TimeSync {
  private state: SyncState = INITIAL
  private listeners = new Set<Listener>()
  private inFlight: Promise<SyncState> | null = null
  /** Monotonic reading at the last successful sync, for staleness checks. */
  private syncedAtMono: number | null = null

  getState(): SyncState {
    return this.state
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private set(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch }
    for (const l of this.listeners) l(this.state)
  }

  /** True time in ms since the epoch. Falls back to the raw device clock when unsynced. */
  now(): number {
    return monoNow() + this.state.offsetMs
  }

  /**
   * True time for a UI event, in ms since the epoch.
   *
   * `event.timeStamp` is stamped by the browser when it generates the event,
   * relative to `performance.timeOrigin` — so it predates dispatch, React's
   * queueing, and any rendering the handler waits behind. For a measurement
   * that is the difference between the instant the finger landed and some tens
   * of milliseconds later.
   *
   * Engines have not always agreed on that origin (some older ones stamped
   * epoch milliseconds), and a synthetic event may carry no useful stamp at
   * all. A plausible stamp lies a few ms in the past, so anything outside that
   * window is rejected in favour of reading the clock now.
   */
  atEvent(eventTimeStamp: number): number {
    const mono = performance.timeOrigin + eventTimeStamp
    const age = monoNow() - mono
    if (!Number.isFinite(age) || age < -50 || age > 1000) return this.now()
    return mono + this.state.offsetMs
  }

  /** How long ago the last successful sync happened, in ms. */
  ageMs(): number {
    if (this.syncedAtMono === null) return Infinity
    return monoNow() - this.syncedAtMono
  }

  async sync(rounds = 4): Promise<SyncState> {
    if (this.inFlight) return this.inFlight
    this.inFlight = this.runSync(rounds).finally(() => {
      this.inFlight = null
    })
    return this.inFlight
  }

  private async runSync(rounds: number): Promise<SyncState> {
    this.set({ syncing: true, error: null })
    const samples: Sample[] = []
    const errors: string[] = []

    // Try sources in order and stick with the first that answers. Falling
    // through to the next only costs time when a source is actually down.
    for (const source of SOURCES) {
      for (let i = 0; i < rounds; i++) {
        try {
          samples.push(await takeSample(source, 4000))
        } catch (err) {
          errors.push(`${source.name}: ${(err as Error).message}`)
          break
        }
      }
      if (samples.length > 0) break
    }

    if (samples.length === 0) {
      this.set({
        syncing: false,
        error: errors[0] ?? 'no time source reachable',
        quality: this.state.lastSyncAt ? this.state.quality : 'unsynced',
      })
      return this.state
    }

    const best = samples.reduce((a, b) => (b.rttMs < a.rttMs ? b : a))
    // Half the round trip bounds the asymmetry error; the source's own
    // resolution adds to it.
    const uncertaintyMs = best.rttMs / 2 + best.granularityMs / 2
    this.syncedAtMono = monoNow()
    this.set({
      offsetMs: best.offsetMs,
      uncertaintyMs,
      source: best.source,
      lastSyncAt: monoNow() + best.offsetMs,
      syncing: false,
      quality: qualityFor(uncertaintyMs),
      error: null,
    })
    return this.state
  }
}

export const timeSync = new TimeSync()
